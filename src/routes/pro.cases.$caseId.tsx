import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SourceViewerProvider, useSourceViewer } from "@/components/pro/SourceViewer";
import { CollapsibleAISummary } from "@/components/pro/CollapsibleAISummary";
import { ReviewActionBar } from "@/components/pro/ReviewActionBar";
import { StatusControl } from "@/components/pro/StatusControl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { addOrgNote, createTask, listOrgNotes, listReviews, listTasks } from "@/lib/pro-service";
import { toast } from "sonner";
import { createExportPackage, recordExportDownload } from "@/lib/export.functions";
import {
  NOT_ASSESSED_HEADING,
  NOT_ASSESSED_TEXT,
  renderSummaryText,
  type SummaryContent,
} from "@/lib/summary-text";

/**
 * WORKSPACE LAYOUT RULE (do not reverse):
 * On open, the "Applicant's own words" tab is active and every AI summary
 * panel across every tab is collapsed by default. This is the anti-
 * automation-bias contract. See CollapsibleAISummary for details.
 */
function CaseWorkspaceInner() {
  const { t } = useTranslation();
  const { caseId } = Route.useParams();

  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-sm uppercase tracking-wide text-muted-foreground">
        {t("pro_shell.nav_cases")} · {caseId.slice(0, 8)}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {t("pro_shell.case_workspace_heading")}
      </h1>

      <Tabs defaultValue="words" className="mt-6">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="words">{t("pro.tabs.words")}</TabsTrigger>
          <TabsTrigger value="documents">{t("pro.tabs.documents")}</TabsTrigger>
          <TabsTrigger value="timeline">{t("pro.tabs.timeline")}</TabsTrigger>
          <TabsTrigger value="evidence">{t("pro.tabs.evidence")}</TabsTrigger>
          <TabsTrigger value="clarify">{t("pro.tabs.clarify")}</TabsTrigger>
          <TabsTrigger value="missing">{t("pro.tabs.missing")}</TabsTrigger>
          <TabsTrigger value="attention">{t("pro.tabs.attention")}</TabsTrigger>
          <TabsTrigger value="summaries">{t("pro.tabs.summaries")}</TabsTrigger>
          <TabsTrigger value="notes">{t("pro.tabs.notes")}</TabsTrigger>
          <TabsTrigger value="tasks">{t("pro.tabs.tasks")}</TabsTrigger>
          <TabsTrigger value="audit">{t("pro.tabs.audit")}</TabsTrigger>
        </TabsList>

        <TabsContent value="words" className="mt-4">
          <WordsTab caseId={caseId} />
        </TabsContent>
        <TabsContent value="documents" className="mt-4">
          <DocumentsTab caseId={caseId} />
        </TabsContent>
        <TabsContent value="timeline" className="mt-4">
          <TimelineTab caseId={caseId} />
        </TabsContent>
        <TabsContent value="evidence" className="mt-4">
          <EvidenceTab caseId={caseId} />
        </TabsContent>
        <TabsContent value="clarify" className="mt-4">
          <ClarifyTab caseId={caseId} />
        </TabsContent>
        <TabsContent value="missing" className="mt-4">
          <MissingTab caseId={caseId} />
        </TabsContent>
        <TabsContent value="attention" className="mt-4">
          <AttentionTab caseId={caseId} />
        </TabsContent>
        <TabsContent value="summaries" className="mt-4">
          <SummariesTab caseId={caseId} />
        </TabsContent>
        <TabsContent value="notes" className="mt-4">
          <NotesTab caseId={caseId} />
        </TabsContent>
        <TabsContent value="tasks" className="mt-4">
          <TasksTab caseId={caseId} />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditTab caseId={caseId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CaseWorkspace() {
  return (
    <SourceViewerProvider>
      <CaseWorkspaceInner />
    </SourceViewerProvider>
  );
}

// ---------------------------------------------------------------------------
// Tab implementations
// ---------------------------------------------------------------------------

function WordsTab({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["pro", caseId, "story"],
    queryFn: async () => {
      const { data } = await supabase
        .from("story_responses")
        .select("id, section_key, prompt_code, body_text, created_at, is_skipped, skip_reason")
        .eq("case_id", caseId)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });
  const { open } = useSourceViewer();

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("pro.loading")}</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">{t("pro.empty_story")}</p>;

  return (
    <div className="space-y-3">
      <p className="text-[14px] text-muted-foreground">{t("pro.words_intro")}</p>
      {data.map((r) => (
        <article key={r.id} className="rounded-lg border bg-surface-raised p-4">
          <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
            {r.section_key} · {r.prompt_code}
          </p>
          {r.is_skipped ? (
            <p className="mt-2 text-[14px] italic text-muted-foreground">
              {t("pro.skipped")}: {r.skip_reason ?? t("pro.no_reason")}
            </p>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-[15px] text-foreground">{r.body_text}</p>
          )}
          <button
            className="mt-2 text-[13px] text-muted-foreground underline"
            onClick={() =>
              open({
                kind: "story",
                answerId: r.id,
                sectionKey: r.section_key,
                excerpt: r.body_text ?? "",
              })
            }
          >
            {t("pro.open_source")}
          </button>
        </article>
      ))}
    </div>
  );
}

function DocumentsTab({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["pro", caseId, "documents"],
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select(
          "id, reference_code, original_filename, doc_type, document_date, primary_language, readability, processing_status",
        )
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const { open } = useSourceViewer();
  if (!data?.length)
    return <p className="text-sm text-muted-foreground">{t("pro.empty_documents")}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border bg-surface-raised">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th className="px-4 py-2">{t("pro.col_reference")}</th>
            <th className="px-4 py-2">{t("pro.doc_apparent_type")}</th>
            <th className="px-4 py-2">{t("pro.doc_date")}</th>
            <th className="px-4 py-2">{t("pro.doc_readability")}</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.id} className="border-b last:border-0">
              <td className="px-4 py-2 font-medium">{d.reference_code}</td>
              <td className="px-4 py-2">{d.doc_type ?? "—"}</td>
              <td className="px-4 py-2 text-muted-foreground">{d.document_date ?? "—"}</td>
              <td className="px-4 py-2 text-muted-foreground">{d.readability ?? "—"}</td>
              <td className="px-4 py-2">
                <button
                  className="text-[13px] underline"
                  onClick={() =>
                    open({
                      kind: "document",
                      documentId: d.id,
                      label: d.original_filename ?? d.reference_code,
                    })
                  }
                >
                  {t("pro.open_source")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimelineTab({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["pro", caseId, "timeline"],
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select(
          "id, reference_code, title, date_start, date_end, date_certainty, location_name, provenance, unsupported, feared_future_event",
        )
        .eq("case_id", caseId)
        .eq("feared_future_event", false)
        .order("date_start", { ascending: true, nullsFirst: false });
      return data ?? [];
    },
  });
  if (!data?.length)
    return <p className="text-sm text-muted-foreground">{t("pro.empty_timeline")}</p>;
  return (
    <div className="space-y-3">
      {data.map((e) => (
        <article key={e.id} className="rounded-lg border bg-surface-raised p-4">
          <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
            {e.reference_code} · {e.date_start ?? t("pro.date_unknown")}
          </p>
          <h3 className="mt-1 text-[16px] font-semibold text-foreground">{e.title}</h3>
          <p className="text-[14px] text-muted-foreground">{e.location_name ?? ""}</p>
          <div className="mt-3 flex items-center gap-3">
            <StatusControl caseId={caseId} targetType="event" targetId={e.id} />
            <ReviewActionBar
              caseId={caseId}
              targetType="event"
              targetId={e.id}
              aiOriginalText={e.title}
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function EvidenceTab({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["pro", caseId, "evidence"],
    queryFn: async () => {
      const { data } = await supabase
        .from("evidence_event_links")
        .select(
          "id, event_id, document_id, relationship, explanation, excerpt, confidence, created_by",
        )
        .eq("case_id", caseId);
      return data ?? [];
    },
  });
  const { open } = useSourceViewer();
  if (!data?.length)
    return <p className="text-sm text-muted-foreground">{t("pro.empty_evidence")}</p>;
  return (
    <div className="space-y-3">
      {data.map((l) => (
        <article key={l.id} className="rounded-lg border bg-surface-raised p-4">
          <p className="text-[13px] text-muted-foreground">
            {t("pro.relationship")}: <strong>{l.relationship}</strong>
          </p>
          <p className="mt-2 text-[15px]">{l.explanation}</p>
          {l.excerpt ? (
            <button
              className="mt-2 text-[13px] underline"
              onClick={() =>
                open({
                  kind: "document",
                  documentId: l.document_id,
                  excerpt: l.excerpt ?? undefined,
                })
              }
            >
              {t("pro.open_source")}
            </button>
          ) : null}
          <div className="mt-3">
            <ReviewActionBar
              caseId={caseId}
              targetType="evidence_event_link"
              targetId={l.id}
              aiOriginalText={l.explanation ?? undefined}
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function ClarifyTab({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["pro", caseId, "clarify"],
    queryFn: async () => {
      const { data } = await supabase.from("clarification_items").select("*").eq("case_id", caseId);
      return data ?? [];
    },
  });
  if (!data?.length)
    return <p className="text-sm text-muted-foreground">{t("pro.empty_clarify")}</p>;
  return (
    <div className="space-y-3">
      {data.map((c) => (
        <article key={c.id} className="rounded-lg border bg-surface-raised p-4">
          <p className="text-[13px] text-muted-foreground">
            {c.category ?? "—"} · {c.urgency ?? "—"}
          </p>
          <p className="mt-1 text-[15px]">{c.observation ?? ""}</p>
          <div className="mt-3 flex items-center gap-3">
            <StatusControl caseId={caseId} targetType="clarification_item" targetId={c.id} />
            <ReviewActionBar
              caseId={caseId}
              targetType="clarification_item"
              targetId={c.id}
              aiOriginalText={c.observation ?? undefined}
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function MissingTab({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["pro", caseId, "missing"],
    queryFn: async () => {
      const { data } = await supabase.from("missing_info_items").select("*").eq("case_id", caseId);
      return data ?? [];
    },
  });
  if (!data?.length)
    return <p className="text-sm text-muted-foreground">{t("pro.empty_missing")}</p>;
  return (
    <ul className="space-y-2">
      {data.map((m) => (
        <li key={m.id} className="rounded-lg border bg-surface-raised p-3 text-[15px]">
          {m.observation ?? "—"}
        </li>
      ))}
    </ul>
  );
}

function AttentionTab({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["pro", caseId, "attention"],
    queryFn: async () => {
      const { data } = await supabase.from("attention_flags").select("*").eq("case_id", caseId);
      return data ?? [];
    },
  });
  if (!data?.length)
    return <p className="text-sm text-muted-foreground">{t("pro.empty_attention")}</p>;
  return (
    <div className="space-y-3">
      {data.map((f) => {
        const rules = !!f.rule_id;
        return (
          <article key={f.id} className="rounded-lg border bg-surface-raised p-4">
            <p className="text-[13px] text-muted-foreground">
              {f.category ?? "—"} · {f.urgency ?? "—"}
              {rules ? " · " + t("pro.rules_based") : ""}
            </p>
            <p className="mt-1 text-[15px]">{f.observation ?? f.reason_for_review}</p>
            <div className="mt-3 flex items-center gap-3">
              <StatusControl caseId={caseId} targetType="attention_flag" targetId={f.id} />
              <ReviewActionBar
                caseId={caseId}
                targetType="attention_flag"
                targetId={f.id}
                aiOriginalText={f.observation ?? undefined}
                rulesBased={rules}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function SummariesTab({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const { data, refetch } = useQuery({
    queryKey: ["pro", caseId, "ai_outputs"],
    queryFn: async () => {
      const [outputs, reviews] = await Promise.all([
        supabase
          .from("ai_outputs")
          .select(
            "id, output_type, version, content, stale, unsupported_sentences_removed, created_at",
          )
          .eq("case_id", caseId)
          .is("superseded_by_id", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("professional_reviews")
          .select("target_id, disposition")
          .eq("case_id", caseId)
          .eq("target_type", "ai_output")
          .in("disposition", ["accepted", "edited"]),
      ]);
      const reviewed = new Set((reviews.data ?? []).map((r) => r.target_id as string));
      return { outputs: outputs.data ?? [], reviewed };
    },
  });

  const outputs = data?.outputs ?? [];
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">{t("pro.summaries_intro")}</p>
      {outputs.map((s) => (
        <CollapsibleAISummary
          key={s.id}
          title={`${s.output_type} · v${s.version} · ${new Date(s.created_at).toLocaleString()}`}
        >
          <SummaryBody content={s.content} />
          {s.unsupported_sentences_removed > 0 ? (
            <p className="mt-2 text-[12px] text-muted-foreground">
              {t("pro.removed_sentences", { count: s.unsupported_sentences_removed })}
            </p>
          ) : null}
          <div className="mt-3">
            <ReviewActionBar
              caseId={caseId}
              targetType="ai_output"
              targetId={s.id}
              aiOriginalText={renderSummaryText(s.content as never)}
              onDone={refetch}
            />
          </div>
          <ExportControl
            caseId={caseId}
            summaryId={s.id}
            stale={s.stale}
            reviewed={data?.reviewed.has(s.id) ?? false}
          />
        </CollapsibleAISummary>
      ))}
      {outputs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("pro.empty_summaries")}</p>
      ) : null}
    </div>
  );
}

function SummaryBody({ content }: { content: unknown }) {
  const c = content as SummaryContent | null;
  if (!c?.sections?.length) {
    return (
      <pre className="overflow-x-auto whitespace-pre-wrap text-[13px]">
        {JSON.stringify(content, null, 2)}
      </pre>
    );
  }
  return (
    <div className="space-y-3">
      {c.sections
        .filter((s) => s.sentences.length > 0)
        .map((s) => (
          <section key={s.key}>
            <h4 className="text-[14px] font-medium">{s.heading}</h4>
            <p className="mt-1 text-[14px]">{s.sentences.map((sent) => sent.text).join(" ")}</p>
          </section>
        ))}
      <div className="rounded-md border-2 border-foreground/70 p-3">
        <h4 className="text-[13px] font-semibold">{NOT_ASSESSED_HEADING}</h4>
        <p className="mt-1 text-[13px]">{c.not_assessed || NOT_ASSESSED_TEXT}</p>
      </div>
    </div>
  );
}

/**
 * GATE 2 at the point of use. The button is disabled and the reason stated
 * whenever the summary has not been reviewed or has gone stale — the server
 * function and the database trigger refuse the same cases regardless.
 */
function ExportControl({
  caseId,
  summaryId,
  stale,
  reviewed,
}: {
  caseId: string;
  summaryId: string;
  stale: boolean;
  reviewed: boolean;
}) {
  const { t } = useTranslation();
  const createExport = useServerFn(createExportPackage);
  const download = useServerFn(recordExportDownload);
  const [busy, setBusy] = useState(false);

  const blockedReason = stale
    ? t("pro.export_blocked_stale")
    : !reviewed
      ? t("pro.export_blocked_unreviewed")
      : null;

  async function run() {
    try {
      setBusy(true);
      const res = await createExport({ data: { caseId, summaryOutputId: summaryId } });
      const link = await download({ data: { exportId: res.exportId } });
      window.open(link.url, "_blank", "noopener,noreferrer");
      toast.success(t("pro.export_created"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t pt-3">
      <Button size="sm" onClick={run} disabled={busy || !!blockedReason}>
        {t("pro.export_button")}
      </Button>
      {blockedReason ? (
        <p className="mt-2 text-[13px] text-muted-foreground">{blockedReason}</p>
      ) : null}
    </div>
  );
}

function NotesTab({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const { data, refetch } = useQuery({
    queryKey: ["pro", caseId, "notes"],
    queryFn: () => listOrgNotes(caseId),
  });
  const [body, setBody] = useState("");
  async function save() {
    try {
      await addOrgNote(caseId, body);
      setBody("");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">{t("pro.notes_privacy")}</p>
      <div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={t("pro.notes_placeholder")}
        />
        <Button className="mt-2" onClick={save} disabled={!body.trim()}>
          {t("pro.notes_save")}
        </Button>
      </div>
      <ul className="space-y-2">
        {(data ?? []).map((n) => (
          <li key={n.id} className="rounded-md border bg-surface-raised p-3">
            <p className="text-[12px] text-muted-foreground">
              {new Date(n.created_at).toLocaleString()}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[15px]">{n.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TasksTab({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const { data, refetch } = useQuery({
    queryKey: ["pro", caseId, "tasks"],
    queryFn: () => listTasks(caseId),
  });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [previewing, setPreviewing] = useState(false);

  async function send() {
    try {
      // assigned_to left null → applicant of the case (RLS will let them see it).
      await createTask({ caseId, title, plainBody: body, assignedToApplicantId: null });
      setTitle("");
      setBody("");
      setPreviewing(false);
      refetch();
      toast.success(t("pro.task_sent"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-surface-raised p-4">
        <p className="text-[13px] text-muted-foreground">{t("pro.task_intro")}</p>
        <Input
          className="mt-3"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("pro.task_title_placeholder")}
        />
        <Textarea
          className="mt-2"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder={t("pro.task_body_placeholder")}
        />
        {previewing ? (
          <div className="mt-3 rounded-md border-2 border-dashed p-3">
            <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
              {t("pro.task_preview_label")}
            </p>
            <h4 className="mt-1 text-[16px] font-semibold">{title || t("pro.task_untitled")}</h4>
            <p className="mt-1 whitespace-pre-wrap text-[15px]">{body}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={send} disabled={!title.trim() || !body.trim()}>
                {t("pro.task_send")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPreviewing(false)}>
                {t("pro.task_back")}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            className="mt-3"
            onClick={() => setPreviewing(true)}
            disabled={!title.trim() || !body.trim()}
          >
            {t("pro.task_preview")}
          </Button>
        )}
      </div>
      <ul className="space-y-2">
        {(data ?? []).map((tk) => (
          <li key={tk.id} className="rounded-md border bg-surface-raised p-3">
            <p className="text-[12px] text-muted-foreground">
              {tk.status} · {new Date(tk.created_at).toLocaleString()}
            </p>
            <p className="mt-1 font-medium">{tk.title}</p>
            <p className="mt-1 whitespace-pre-wrap text-[14px] text-muted-foreground">
              {tk.plain_language_body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AuditTab({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["pro", caseId, "audit"],
    queryFn: () => listReviews(caseId),
  });
  if (!data?.length) return <p className="text-sm text-muted-foreground">{t("pro.empty_audit")}</p>;
  return (
    <ul className="space-y-2">
      {data.map((r) => {
        const content = (r.edited_content ?? null) as {
          edited_text?: string | null;
          ai_original_text?: string | null;
        } | null;
        return (
          <li key={r.id} className="rounded-md border bg-surface-raised p-3 text-[14px]">
            <p className="text-[12px] text-muted-foreground">
              {new Date(r.reviewed_at).toLocaleString()} · {r.target_type} · {r.disposition}
            </p>
            {content?.ai_original_text ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-[12px] text-muted-foreground">
                  {t("pro.audit_ai_original")}
                </summary>
                <p className="mt-1 whitespace-pre-wrap text-[13px]">{content.ai_original_text}</p>
              </details>
            ) : null}
            {content?.edited_text ? (
              <p className="mt-1 whitespace-pre-wrap">{content.edited_text}</p>
            ) : null}
            {r.reason ? (
              <p className="mt-1 text-[13px] text-muted-foreground">
                {t("pro.audit_reason")}: {r.reason}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export const Route = createFileRoute("/pro/cases/$caseId")({ component: CaseWorkspace });
