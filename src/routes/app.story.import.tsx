// Narrative intake (S1-1). Paste or upload a story that is already written,
// see where each part of it would go, and choose what to keep.
//
// Nothing is saved until the person presses the confirm button. Every excerpt
// shown here has already been checked against their original text, so what
// they are approving is their own wording, not a model's rendering of it.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, FileUp, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/shell/PageHeader";
import { AIGeneratedBanner } from "@/components/primitives/AIGeneratedBanner";
import { useSession } from "@/hooks/use-session";
import { getOrCreateOwnCase } from "@/lib/case-service";
import { insertResponse } from "@/lib/story-service";
import { mapNarrative, type Proposal } from "@/lib/narrative-intake.functions";
import { readNarrativeFile, ACCEPTED_NARRATIVE_TYPES } from "@/lib/narrative-file";

function ImportView() {
  const { t } = useTranslation();
  const { user } = useSession();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [narrative, setNarrative] = useState("");
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const caseQ = useQuery({
    queryKey: ["own-case", user?.id],
    enabled: !!user?.id,
    queryFn: () => getOrCreateOwnCase(user!.id),
  });
  const caseId = caseQ.data?.id ?? null;

  const runMap = useServerFn(mapNarrative);
  const mapMut = useMutation({
    mutationFn: async () => runMap({ data: { caseId: caseId!, narrative } }),
    onSuccess: (res) => {
      setProposals(res.proposals);
      // Everything starts selected; opting out is one tap, and nothing is
      // saved either way until the confirm button.
      setChosen(new Set(res.proposals.map(keyOf)));
      if (res.proposals.length === 0) toast.info(t("import.none_found"));
    },
    onError: (e) =>
      toast.error(
        e instanceof Error && e.message.includes("consent_required")
          ? t("import.consent_needed")
          : t("import.failed"),
      ),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const picked = (proposals ?? []).filter((p) => chosen.has(keyOf(p)));
      for (const p of picked) {
        await insertResponse({
          caseId: caseId!,
          sectionKey: p.sectionKey,
          promptCode: p.promptCode,
          promptVersion: p.promptVersion,
          inputType: p.inputType,
          language: "en",
          bodyText: p.excerpt,
          // StoryValue carries date/provenance structure; a prose answer keeps
          // its text in body_text and leaves this empty.
          value: {},
          privateHold: false,
          inputMode: "typed",
        });
      }
      return picked.length;
    },
    onSuccess: (n) => {
      toast.success(t("import.saved", { count: n }));
      navigate({ to: "/app/story" });
    },
    onError: () => toast.error(t("import.save_failed")),
  });

  const grouped = useMemo(() => {
    const by = new Map<string, { title: string; items: Proposal[] }>();
    for (const p of proposals ?? []) {
      const g = by.get(p.sectionKey) ?? { title: p.sectionTitle, items: [] };
      g.items.push(p);
      by.set(p.sectionKey, g);
    }
    return [...by.entries()];
  }, [proposals]);

  async function onFile(file: File) {
    try {
      const text = await readNarrativeFile(file);
      setNarrative(text);
      toast.success(t("import.file_loaded"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("import.file_failed"));
    }
  }

  return (
    <div className="reading-column py-2 sm:py-4">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ms-2">
        <Link to="/app/story">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("import.back")}
        </Link>
      </Button>

      <PageHeader title={t("import.title")} intro={t("import.intro")} />

      {proposals === null ? (
        <>
          <div className="surface-card p-4 md:p-5">
            <Label htmlFor="narrative">{t("import.paste_label")}</Label>
            <Textarea
              id="narrative"
              rows={12}
              className="mt-2"
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder={t("import.paste_placeholder")}
            />
            <p className="mt-2 text-[0.8125rem] text-muted-foreground">
              {t("import.char_count", { count: narrative.length })}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                <FileUp className="h-4 w-4" aria-hidden="true" />
                {t("import.choose_file")}
              </Button>
              <span className="text-[0.8125rem] text-muted-foreground">
                {t("import.file_hint")}
              </span>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED_NARRATIVE_TYPES}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => mapMut.mutate()}
              disabled={!caseId || narrative.trim().length < 40 || mapMut.isPending}
            >
              {mapMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              {t("import.analyse")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <AIGeneratedBanner />
          <p className="mt-3 text-sm text-muted-foreground">{t("import.review_intro")}</p>

          {grouped.length === 0 ? (
            <div className="surface-card mt-4 p-5">
              <p className="m-0 text-sm text-muted-foreground">{t("import.none_found")}</p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {grouped.map(([sectionKey, g]) => (
                <section key={sectionKey} className="surface-card p-4 md:p-5">
                  <h2 className="text-section-title m-0 text-foreground">{g.title}</h2>
                  <ul className="m-0 mt-3 grid list-none gap-3 p-0">
                    {g.items.map((p) => {
                      const k = keyOf(p);
                      return (
                        <li
                          key={k}
                          className="flex items-start gap-3 rounded-lg border border-border bg-surface-sunken/40 p-3"
                        >
                          <Checkbox
                            id={k}
                            checked={chosen.has(k)}
                            onCheckedChange={(v) =>
                              setChosen((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(k);
                                else next.delete(k);
                                return next;
                              })
                            }
                            className="mt-1"
                          />
                          <div className="min-w-0 flex-1">
                            <label
                              htmlFor={k}
                              className="block text-[0.8125rem] font-medium text-muted-foreground"
                            >
                              {p.label}
                            </label>
                            {/* Their words, shown exactly as written. */}
                            <p className="m-0 mt-1 whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-foreground">
                              {p.excerpt}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setProposals(null)}>
              {t("import.start_over")}
            </Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={chosen.size === 0 || saveMut.isPending}
            >
              {saveMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {t("import.confirm", { count: chosen.size })}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function keyOf(p: Proposal): string {
  return `${p.promptCode}::${p.excerpt.slice(0, 40)}`;
}

export const Route = createFileRoute("/app/story/import")({ component: ImportView });
