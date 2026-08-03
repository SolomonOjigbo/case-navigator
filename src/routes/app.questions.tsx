import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/shell/EmptyState";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Loader2, Printer, Sparkles, Plus, MessageSquare, FileQuestion } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { AIGeneratedBanner } from "@/components/primitives/AIGeneratedBanner";
import { addQuestion, generateQuestions, updateQuestion } from "@/lib/generate-questions.functions";

type Q = {
  id: string;
  reference_code: string;
  kind: "self" | "lawyer";
  text: string;
  status: "open" | "kept" | "dismissed" | "answered";
  created_by: "ai" | "user";
};

async function load(userId: string) {
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id")
    .eq("applicant_id", userId)
    .maybeSingle();
  if (!caseRow) return { caseId: null as string | null, items: [] as Q[] };
  const { data } = await supabase
    .from("applicant_questions")
    .select("id, reference_code, kind, text, status, created_by")
    .eq("case_id", caseRow.id)
    .neq("status", "dismissed")
    .order("created_at", { ascending: true });
  return { caseId: caseRow.id, items: (data ?? []) as Q[] };
}

function useUser() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => alive && setId(data.user?.id ?? null));
    return () => {
      alive = false;
    };
  }, []);
  return id;
}

function View() {
  const { t } = useTranslation();
  const userId = useUser();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["questions", userId],
    queryFn: () => load(userId!),
    enabled: !!userId,
  });

  const runGen = useServerFn(generateQuestions);
  const gen = useMutation({
    mutationFn: (caseId: string) => runGen({ data: { caseId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["questions", userId] }),
  });
  const update = useServerFn(updateQuestion);
  const upd = useMutation({
    mutationFn: (v: { questionId: string; action: "keep" | "dismiss" | "edit"; text?: string }) =>
      update({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["questions", userId] }),
  });
  const add = useServerFn(addQuestion);
  const addM = useMutation({
    mutationFn: (v: { caseId: string; kind: "self" | "lawyer"; text: string }) => add({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["questions", userId] }),
  });

  const data = q.data;
  const self = useMemo(() => (data?.items ?? []).filter((i) => i.kind === "self"), [data?.items]);
  const lawyer = useMemo(
    () => (data?.items ?? []).filter((i) => i.kind === "lawyer"),
    [data?.items],
  );

  if (!userId || q.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (!data?.caseId) {
    return (
      <div className="reading-column py-2 sm:py-4">
        <EmptyState icon={FileQuestion} title={t("questions.no_case")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2 print:space-y-1">
        <h1 className="text-page-title text-foreground">{t("questions.title")}</h1>
        <p className="text-lead print:hidden">
          Some questions you can think about on your own. Others you may want to ask a lawyer. Keep
          the ones that help, dismiss the rest, or write your own.
        </p>
      </header>

      <div className="print:hidden">
        <AIGeneratedBanner />
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button onClick={() => gen.mutate(data.caseId!)} disabled={gen.isPending}>
          {gen.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Drafting…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" aria-hidden="true" /> Draft questions
            </>
          )}
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" /> Print / save as PDF
        </Button>
      </div>

      <Tabs defaultValue="lawyer" className="print:hidden">
        <TabsList>
          <TabsTrigger value="lawyer">For a lawyer ({lawyer.length})</TabsTrigger>
          <TabsTrigger value="self">You can think about ({self.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="lawyer" className="mt-4 space-y-3">
          <QuestionList
            items={lawyer}
            pending={upd.isPending}
            onAct={(id, action, text) => upd.mutate({ questionId: id, action, text })}
          />
          <AddQuestion
            kind="lawyer"
            pending={addM.isPending}
            onAdd={(text) => addM.mutate({ caseId: data.caseId!, kind: "lawyer", text })}
          />
        </TabsContent>
        <TabsContent value="self" className="mt-4 space-y-3">
          <QuestionList
            items={self}
            pending={upd.isPending}
            onAct={(id, action, text) => upd.mutate({ questionId: id, action, text })}
          />
          <AddQuestion
            kind="self"
            pending={addM.isPending}
            onAdd={(text) => addM.mutate({ caseId: data.caseId!, kind: "self", text })}
          />
        </TabsContent>
      </Tabs>

      {/* Print-only page: kept questions for the lawyer. */}
      <section className="hidden print:block">
        <h2 className="text-lg font-semibold">{t("questions.for_lawyer")}</h2>
        <ol className="mt-2 list-decimal space-y-2 ps-5">
          {lawyer
            .filter((i) => i.status === "kept")
            .map((i) => (
              <li key={i.id}>{i.text}</li>
            ))}
        </ol>
        <h2 className="mt-6 text-lg font-semibold">{t("questions.to_think_about")}</h2>
        <ol className="mt-2 list-decimal space-y-2 ps-5">
          {self
            .filter((i) => i.status === "kept")
            .map((i) => (
              <li key={i.id}>{i.text}</li>
            ))}
        </ol>
      </section>
    </div>
  );
}

function QuestionList({
  items,
  pending,
  onAct,
}: {
  items: Q[];
  pending: boolean;
  onAct: (id: string, action: "keep" | "dismiss" | "edit", text?: string) => void;
}) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return <EmptyState icon={MessageSquare} title={t("questions.empty")} />;
  }
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <QuestionCard key={i.id} item={i} pending={pending} onAct={onAct} />
      ))}
    </ul>
  );
}

function QuestionCard({
  item,
  pending,
  onAct,
}: {
  item: Q;
  pending: boolean;
  onAct: (id: string, action: "keep" | "dismiss" | "edit", text?: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  return (
    <li className="rounded-lg border bg-surface-raised p-4">
      {editing ? (
        <div className="space-y-2">
          <Label htmlFor={`edit-${item.id}`}>{t("questions.edit_label")}</Label>
          <Textarea
            id={`edit-${item.id}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                onAct(item.id, "edit", text);
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setText(item.text);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-[15px] text-foreground">{item.text}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Reference {item.reference_code}
            {item.status === "kept" ? " · kept" : null}
            {item.created_by === "ai" ? " · drafted by the assistant" : " · your own"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.status !== "kept" && (
              <Button size="sm" onClick={() => onAct(item.id, "keep")} disabled={pending}>
                Keep
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={pending}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onAct(item.id, "dismiss")}
              disabled={pending}
            >
              Dismiss
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

function AddQuestion({
  kind,
  pending,
  onAdd,
}: {
  kind: "self" | "lawyer";
  pending: boolean;
  onAdd: (text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="rounded-lg border border-dashed p-4">
      <Label htmlFor={`add-${kind}`} className="text-sm">
        {kind === "lawyer"
          ? "Add your own question for a lawyer"
          : "Add your own question to think about"}
      </Label>
      <div className="mt-2 flex gap-2">
        <Input
          id={`add-${kind}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your question…"
        />
        <Button
          onClick={() => {
            if (text.trim()) {
              onAdd(text.trim());
              setText("");
            }
          }}
          disabled={pending || text.trim().length === 0}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add
        </Button>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/app/questions")({ component: View });
