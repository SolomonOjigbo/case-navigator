// The forums (S6-1).
//
// Topics are `community_posts` rows with a title and a category, and replies
// are `community_comments`. That is deliberate: the moderation queue, the
// blocking filter and reporting were all built against those two tables, and
// a parallel set of forum tables would have needed a parallel set of all
// three. One moderation path, or content that quietly escapes it.
//
// The two filters that apply everywhere below, and must keep applying:
//   * `hidden_at` — a moderator's decision, and it applies to everyone.
//   * blocks — personal to the reader, applied in code because RLS cannot
//     express "hide this from one person but not another" cheaply here.
import { supabase } from "@/integrations/supabase/client";
import { listBlockedIds, withoutBlocked } from "./moderation-service";
import { fetchAuthors, type PostAuthor } from "./community-service";

export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
};

export type CategoryWithActivity = Category & {
  topic_count: number;
  last_activity_at: string | null;
};

export type Topic = {
  id: string;
  author_id: string;
  category_id: string | null;
  title: string | null;
  body: string;
  image_url: string | null;
  created_at: string;
  last_activity_at: string;
  reply_count: number;
  pinned_at: string | null;
  author: PostAuthor | null;
  like_count: number;
  liked_by_me: boolean;
};

const TOPIC_COLUMNS =
  "id,author_id,category_id,title,body,image_url,created_at,last_activity_at,reply_count,pinned_at";

export const TITLE_MIN = 3;
export const TITLE_MAX = 140;
export const BODY_MAX = 5000;

/** How a topic is listed when it was written before titles existed. */
export function topicHeading(topic: Pick<Topic, "title" | "body">): string {
  const title = topic.title?.trim();
  if (title) return title;
  const firstLine = topic.body.trim().split("\n")[0];
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}

// -------------------------------------------------------------------------
// Categories
// -------------------------------------------------------------------------

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("community_categories")
    .select("id,slug,name,description,sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const { data, error } = await supabase
    .from("community_categories")
    .select("id,slug,name,description,sort_order")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return (data as Category) ?? null;
}

/**
 * The forum index: every category with how much is in it and when it last
 * moved. An empty category still appears — a room with nobody in it is an
 * invitation, and hiding it would make the forum look smaller than it is.
 */
export async function listCategoriesWithActivity(
  currentUserId: string,
): Promise<CategoryWithActivity[]> {
  const [categories, { data: topics }, blocked] = await Promise.all([
    listCategories(),
    supabase
      .from("community_posts")
      .select("id,category_id,author_id,last_activity_at")
      .is("hidden_at", null)
      .order("last_activity_at", { ascending: false })
      .limit(1000),
    listBlockedIds(currentUserId).catch(() => new Set<string>()),
  ]);

  const visible = withoutBlocked(
    (topics ?? []) as Array<{
      id: string;
      category_id: string | null;
      author_id: string;
      last_activity_at: string;
    }>,
    blocked,
  );

  const counts = new Map<string, number>();
  const latest = new Map<string, string>();
  for (const t of visible) {
    if (!t.category_id) continue;
    counts.set(t.category_id, (counts.get(t.category_id) ?? 0) + 1);
    const current = latest.get(t.category_id);
    if (!current || t.last_activity_at > current) latest.set(t.category_id, t.last_activity_at);
  }

  return categories.map((c) => ({
    ...c,
    topic_count: counts.get(c.id) ?? 0,
    last_activity_at: latest.get(c.id) ?? null,
  }));
}

// -------------------------------------------------------------------------
// Topics
// -------------------------------------------------------------------------

async function decorate(
  rows: Array<Record<string, unknown>>,
  currentUserId: string,
): Promise<Topic[]> {
  if (rows.length === 0) return [];
  const list = rows as unknown as Omit<Topic, "author" | "like_count" | "liked_by_me">[];
  const ids = list.map((t) => t.id);

  const [authors, { data: likes }] = await Promise.all([
    fetchAuthors(list.map((t) => t.author_id)),
    supabase.from("community_likes").select("post_id,user_id").in("post_id", ids),
  ]);

  const likeCount = new Map<string, number>();
  const likedByMe = new Set<string>();
  for (const l of (likes ?? []) as Array<{ post_id: string; user_id: string }>) {
    likeCount.set(l.post_id, (likeCount.get(l.post_id) ?? 0) + 1);
    if (l.user_id === currentUserId) likedByMe.add(l.post_id);
  }

  return list.map((t) => ({
    ...t,
    author: authors.get(t.author_id) ?? null,
    like_count: likeCount.get(t.id) ?? 0,
    liked_by_me: likedByMe.has(t.id),
  }));
}

/**
 * Topics in a category, or across the whole forum when `categoryId` is null.
 *
 * Ordered by last activity, not by creation: a question someone answered this
 * morning is more use to the next reader than one posted this morning and
 * ignored. Pinned topics sit above that.
 */
export async function listTopics(input: {
  currentUserId: string;
  categoryId?: string | null;
  limit?: number;
  /**
   * Float pinned topics to the top. True for a category, where a pinned
   * topic is a signpost. False for "recently active", where a pin would put
   * a six-week-old welcome post above everything and quietly contradict the
   * heading.
   */
  respectPins?: boolean;
}): Promise<Topic[]> {
  let q = supabase
    .from("community_posts")
    .select(TOPIC_COLUMNS)
    .is("hidden_at", null)
    .limit(input.limit ?? 50);

  if (input.respectPins !== false) {
    q = q.order("pinned_at", { ascending: false, nullsFirst: false });
  }
  q = q.order("last_activity_at", { ascending: false });

  if (input.categoryId) q = q.eq("category_id", input.categoryId);

  const [{ data, error }, blocked] = await Promise.all([
    q,
    listBlockedIds(input.currentUserId).catch(() => new Set<string>()),
  ]);
  if (error) throw error;

  const visible = withoutBlocked(
    (data ?? []) as Array<{ author_id: string } & Record<string, unknown>>,
    blocked,
  );
  return decorate(visible, input.currentUserId);
}

export async function getTopic(id: string, currentUserId: string): Promise<Topic | null> {
  const { data, error } = await supabase
    .from("community_posts")
    .select(TOPIC_COLUMNS)
    .eq("id", id)
    .is("hidden_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [decorated] = await decorate([data as Record<string, unknown>], currentUserId);
  return decorated ?? null;
}

export async function createTopic(input: {
  authorId: string;
  categoryId: string;
  title: string;
  body: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from("community_posts")
    .insert({
      author_id: input.authorId,
      category_id: input.categoryId,
      title: input.title.trim().slice(0, TITLE_MAX),
      body: input.body.trim().slice(0, BODY_MAX),
    })
    .select("id")
    .single();
  if (error) throw asPostingError(error);
  return data.id;
}

/**
 * The rate limit reaches a person, so it must not reach them as
 * "rate_limited". Everything else is passed through unchanged.
 */
export function asPostingError(error: { message?: string; hint?: string | null }): Error {
  const text = `${error.message ?? ""} ${error.hint ?? ""}`;
  if (/rate_limited/.test(text)) return new Error("rate_limited");
  return new Error(error.message ?? "unknown");
}

/**
 * Search titles and bodies.
 *
 * `websearch_to_tsquery` so someone can type the way they would into a search
 * box — quoted phrases and `or` work, and a stray operator does not error.
 */
export async function searchTopics(input: {
  query: string;
  currentUserId: string;
}): Promise<Topic[]> {
  const query = input.query.trim();
  if (query.length < 2) return [];

  const [{ data, error }, blocked] = await Promise.all([
    supabase
      .from("community_posts")
      .select(TOPIC_COLUMNS)
      .is("hidden_at", null)
      .textSearch("search_vector", query, { type: "websearch", config: "simple" })
      .order("last_activity_at", { ascending: false })
      .limit(50),
    listBlockedIds(input.currentUserId).catch(() => new Set<string>()),
  ]);
  if (error) throw error;

  const visible = withoutBlocked(
    (data ?? []) as Array<{ author_id: string } & Record<string, unknown>>,
    blocked,
  );
  return decorate(visible, input.currentUserId);
}

/** Moderator only; the database refuses anyone else. */
export async function setTopicPinned(topicId: string, pinned: boolean) {
  const { error } = await supabase.rpc("set_topic_pinned", {
    p_post_id: topicId,
    p_pinned: pinned,
  });
  if (error) throw error;
}
