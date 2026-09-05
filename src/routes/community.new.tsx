// Starting a topic (S6-2), and the one screen that carries S6-4.
//
// This is the moment where the risk of a public community actually lands: a
// person is about to write, in a place other people can read, about something
// that happened to them. The notice above the form is not boilerplate — it is
// the specific, concrete advice someone needs before they type a village name
// or a hearing date.
//
// It appears every time rather than once and dismissed forever. Someone who
// posted about housing in March is in a different position when they come back
// in June to write about the people who threatened them.
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, PenLine, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shell/PageHeader";
import { ProfileGate } from "@/components/community/ProfileGate";
import { useSession } from "@/hooks/use-session";
import { getMyCommunityProfile } from "@/lib/community-service";
import { BODY_MAX, TITLE_MAX, TITLE_MIN, createTopic, listCategories } from "@/lib/forum-service";
import { checkDraft, type DraftFinding } from "@/lib/draft-check";
import { DraftCheckDialog } from "@/components/community/DraftCheckDialog";

type Search = { category?: string };

function NewTopicView() {
  return (
    <ProfileGate>
      <Composer />
    </ProfileGate>
  );
}

function Composer() {
  const { t } = useTranslation();
  const { user } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const search = useSearch({ from: "/community/new" }) as Search;

  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // Findings held here rather than recomputed on every keystroke: the check
  // runs once, when someone presses post, so nothing flickers at them while
  // they are still deciding what to say.
  const [findings, setFindings] = useState<DraftFinding[]>([]);

  const categoriesQ = useQuery({ queryKey: ["forum-categories-plain"], queryFn: listCategories });

  // The handle this will be posted under. Shown next to the button, because
  // "who will see my name on this" is the question people actually have and
  // the answer is reassuring.
  const profileQ = useQuery({
    queryKey: ["community-profile", user?.id],
    enabled: !!user?.id,
    queryFn: () => getMyCommunityProfile(user!.id),
  });

  useEffect(() => {
    if (categoryId || !categoriesQ.data?.length) return;
    const preselected = search.category
      ? categoriesQ.data.find((c) => c.slug === search.category)
      : undefined;
    setCategoryId(preselected?.id ?? categoriesQ.data[0].id);
  }, [categoriesQ.data, search.category, categoryId]);

  const createMut = useMutation({
    mutationFn: () => createTopic({ authorId: user!.id, categoryId, title, body }),
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["forum-recent"] });
      qc.invalidateQueries({ queryKey: ["forum-topics"] });
      qc.invalidateQueries({ queryKey: ["forum-categories"] });
      toast.success(t("forum.posted"));
      navigate({ to: "/community/t/$topicId", params: { topicId: id } });
    },
    onError: (e) =>
      toast.error(
        e instanceof Error && e.message === "rate_limited"
          ? t("notif.rate_limited")
          : t("forum.post_failed"),
      ),
  });

  const canPost = title.trim().length >= TITLE_MIN && body.trim().length > 0 && categoryId !== "";

  /** Look at the draft first; publish only if there is nothing to mention. */
  function attemptPost() {
    const found = checkDraft(`${title}\n${body}`);
    if (found.length > 0) {
      setFindings(found);
      return;
    }
    createMut.mutate();
  }

  return (
    <div className="reading-column py-2 sm:py-4">
      <Button asChild size="sm" variant="ghost" className="mb-2 -ms-2">
        <Link to="/community">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("forum.back")}
        </Link>
      </Button>

      <PageHeader title={t("forum.new_title")} intro={t("forum.new_intro")} />

      {/* S6-4. Concrete, not a warning label. */}
      <div role="note" className="banner-attention mb-6 text-sm">
        <p className="m-0 flex items-start gap-2.5 font-medium">
          <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("forum.safety_heading")}</span>
        </p>
        <ul className="m-0 mt-2 grid list-disc gap-1 ps-9">
          <li>{t("forum.safety_identifying")}</li>
          <li>{t("forum.safety_others")}</li>
          <li>{t("forum.safety_case")}</li>
        </ul>
        <p className="m-0 mt-2 ps-9 text-muted-foreground">{t("forum.safety_private")}</p>
      </div>

      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canPost) attemptPost();
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="topic-category">{t("forum.category_label")}</Label>
          <select
            id="topic-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="min-h-10 rounded-md border border-input bg-surface-raised px-2 text-base md:text-sm"
          >
            {(categoriesQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="topic-title">{t("forum.title_label")}</Label>
          <Input
            id="topic-title"
            value={title}
            maxLength={TITLE_MAX}
            placeholder={t("forum.title_placeholder")}
            onChange={(e) => setTitle(e.target.value)}
          />
          <p className="m-0 text-[0.8125rem] text-muted-foreground">{t("forum.title_help")}</p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="topic-body">{t("forum.body_label")}</Label>
          <Textarea
            id="topic-body"
            rows={10}
            maxLength={BODY_MAX}
            value={body}
            placeholder={t("forum.body_placeholder")}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!canPost || createMut.isPending}>
            {createMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <PenLine className="h-4 w-4" aria-hidden="true" />
            )}
            {t("forum.post")}
          </Button>
          {profileQ.data?.handle ? (
            <span className="text-[0.8125rem] text-muted-foreground">
              {t("forum.posting_as", { handle: profileQ.data.handle })}
            </span>
          ) : null}
        </div>
      </form>
      <DraftCheckDialog
        open={findings.length > 0}
        findings={findings}
        onEdit={() => setFindings([])}
        onPostAnyway={() => {
          setFindings([]);
          createMut.mutate();
        }}
      />
    </div>
  );
}

export const Route = createFileRoute("/community/new")({
  component: NewTopicView,
  validateSearch: (search: Record<string, unknown>): Search => ({
    category: typeof search.category === "string" ? search.category : undefined,
  }),
});
