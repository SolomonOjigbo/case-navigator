import { supabase } from "@/integrations/supabase/client";
import { listBlockedIds, withoutBlocked } from "./moderation-service";

export type CommunityProfile = {
  id: string;
  user_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

export type PostAuthor = Pick<
  CommunityProfile,
  "user_id" | "handle" | "display_name" | "avatar_url"
>;

export type PostWithMeta = {
  id: string;
  author_id: string;
  body: string;
  image_url: string | null;
  created_at: string;
  author: PostAuthor | null;
  like_count: number;
  liked_by_me: boolean;
  comment_count: number;
};

export type CommunityComment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: PostAuthor | null;
};

export type Room = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

export type RoomMessage = {
  id: string;
  room_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: PostAuthor | null;
};

export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export async function getMyCommunityProfile(userId: string) {
  const { data, error } = await supabase
    .from("community_profiles")
    .select("id,user_id,handle,display_name,avatar_url,bio")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as CommunityProfile | null;
}

export async function upsertCommunityProfile(input: {
  userId: string;
  handle: string;
  displayName: string | null;
  bio: string | null;
}) {
  const existing = await getMyCommunityProfile(input.userId);
  if (existing) {
    const { error } = await supabase
      .from("community_profiles")
      .update({
        handle: input.handle,
        display_name: input.displayName,
        bio: input.bio,
      })
      .eq("user_id", input.userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("community_profiles").insert({
      user_id: input.userId,
      handle: input.handle,
      display_name: input.displayName,
      bio: input.bio,
    });
    if (error) throw error;
  }
}

async function fetchAuthorsByUserIds(userIds: string[]) {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return new Map<string, PostAuthor>();
  const { data, error } = await supabase
    .from("community_profiles")
    .select("user_id,handle,display_name,avatar_url")
    .in("user_id", unique);
  if (error) throw error;
  const map = new Map<string, PostAuthor>();
  for (const r of (data ?? []) as PostAuthor[]) map.set(r.user_id, r);
  return map;
}

export async function listFeed(currentUserId: string): Promise<PostWithMeta[]> {
  // Two independent filters. hidden_at is a moderator decision and applies to
  // everyone; blocks are personal and apply only to this reader.
  const [{ data: posts, error }, blocked] = await Promise.all([
    supabase
      .from("community_posts")
      .select("id,author_id,body,image_url,created_at")
      .is("hidden_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    listBlockedIds(currentUserId).catch(() => new Set<string>()),
  ]);
  if (error) throw error;
  const list = withoutBlocked(
    (posts ?? []) as Array<{
      id: string;
      author_id: string;
      body: string;
      image_url: string | null;
      created_at: string;
    }>,
    blocked,
  );
  if (list.length === 0) return [];

  const ids = list.map((p) => p.id);
  const authors = await fetchAuthorsByUserIds(list.map((p) => p.author_id));

  const [{ data: likes }, { data: comments }] = await Promise.all([
    supabase.from("community_likes").select("post_id,user_id").in("post_id", ids),
    supabase.from("community_comments").select("post_id").in("post_id", ids),
  ]);

  const likeCount = new Map<string, number>();
  const likedByMe = new Set<string>();
  for (const l of (likes ?? []) as Array<{ post_id: string; user_id: string }>) {
    likeCount.set(l.post_id, (likeCount.get(l.post_id) ?? 0) + 1);
    if (l.user_id === currentUserId) likedByMe.add(l.post_id);
  }
  const commentCount = new Map<string, number>();
  for (const c of (comments ?? []) as Array<{ post_id: string }>) {
    commentCount.set(c.post_id, (commentCount.get(c.post_id) ?? 0) + 1);
  }

  return list.map((p) => ({
    ...p,
    author: authors.get(p.author_id) ?? null,
    like_count: likeCount.get(p.id) ?? 0,
    liked_by_me: likedByMe.has(p.id),
    comment_count: commentCount.get(p.id) ?? 0,
  }));
}

export async function createPost(input: { authorId: string; body: string }) {
  const { error } = await supabase.from("community_posts").insert({
    author_id: input.authorId,
    body: input.body,
  });
  if (error) throw error;
}

export async function deletePost(postId: string) {
  const { error } = await supabase.from("community_posts").delete().eq("id", postId);
  if (error) throw error;
}

export async function toggleLike(input: {
  postId: string;
  userId: string;
  currentlyLiked: boolean;
}) {
  if (input.currentlyLiked) {
    const { error } = await supabase
      .from("community_likes")
      .delete()
      .eq("post_id", input.postId)
      .eq("user_id", input.userId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("community_likes")
      .insert({ post_id: input.postId, user_id: input.userId });
    if (error) throw error;
  }
}

export async function listComments(
  postId: string,
  currentUserId?: string,
): Promise<CommunityComment[]> {
  const blocked = currentUserId
    ? await listBlockedIds(currentUserId).catch(() => new Set<string>())
    : new Set<string>();
  const { data, error } = await supabase
    .from("community_comments")
    .select("id,post_id,author_id,body,created_at")
    .is("hidden_at", null)
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = withoutBlocked((data ?? []) as Array<Omit<CommunityComment, "author">>, blocked);
  const authors = await fetchAuthorsByUserIds(rows.map((r) => r.author_id));
  return rows.map((r) => ({ ...r, author: authors.get(r.author_id) ?? null }));
}

export async function addComment(input: { postId: string; authorId: string; body: string }) {
  const { error } = await supabase.from("community_comments").insert({
    post_id: input.postId,
    author_id: input.authorId,
    body: input.body,
  });
  if (error) throw error;
}

export async function listRooms(): Promise<Room[]> {
  const { data, error } = await supabase
    .from("community_rooms")
    .select("id,slug,name,description")
    .eq("is_public", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Room[];
}

export async function getRoomBySlug(slug: string): Promise<Room | null> {
  const { data, error } = await supabase
    .from("community_rooms")
    .select("id,slug,name,description")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as Room | null) ?? null;
}

export async function listRoomMessages(
  roomId: string,
  currentUserId?: string,
): Promise<RoomMessage[]> {
  const [{ data, error }, blocked] = await Promise.all([
    supabase
      .from("community_messages")
      .select("id,room_id,author_id,body,created_at")
      .eq("room_id", roomId)
      .is("hidden_at", null)
      .order("created_at", { ascending: true })
      .limit(200),
    currentUserId
      ? listBlockedIds(currentUserId).catch(() => new Set<string>())
      : Promise.resolve(new Set<string>()),
  ]);
  if (error) throw error;
  const rows = withoutBlocked(
    (data ?? []) as Array<Omit<RoomMessage, "author"> & { room_id: string }>,
    blocked,
  );
  const authors = await fetchAuthorsByUserIds(rows.map((r) => r.author_id));
  return rows.map((r) => ({ ...r, author: authors.get(r.author_id) ?? null }));
}

export async function sendRoomMessage(input: { roomId: string; authorId: string; body: string }) {
  const { error } = await supabase.from("community_messages").insert({
    room_id: input.roomId,
    author_id: input.authorId,
    body: input.body,
  });
  if (error) throw error;
}

export function displayNameOf(author: PostAuthor | null | undefined): string {
  if (!author) return "someone";
  return author.display_name?.trim() || `@${author.handle}`;
}
