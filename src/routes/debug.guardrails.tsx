// Dev-only. Shows the guardrails actually firing rather than asking anyone to
// trust that they are: dropped facts, blocked responses, removed unsupported
// sentences. Reads ai_outputs.guardrail_results, which every AI path writes to
// whether it succeeded or was blocked.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OutputRow = {
  id: string;
  case_id: string;
  output_type: string;
  created_at: string;
  unsupported_sentences_removed: number;
  guardrail_results: Record<string, unknown> | null;
};

type Totals = {
  responses: number;
  blocked: number;
  droppedVerbatim: number;
  droppedAmbiguousDate: number;
  forbiddenVocabularyBlocks: number;
  probabilityBlocks: number;
  schemaFailures: number;
  unsupportedSentencesRemoved: number;
};

function tally(rows: OutputRow[]): Totals {
  const t: Totals = {
    responses: rows.length,
    blocked: 0,
    droppedVerbatim: 0,
    droppedAmbiguousDate: 0,
    forbiddenVocabularyBlocks: 0,
    probabilityBlocks: 0,
    schemaFailures: 0,
    unsupportedSentencesRemoved: 0,
  };
  for (const r of rows) {
    const g = (r.guardrail_results ?? {}) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" ? v : 0);
    if (g.blocked === true) t.blocked++;
    t.droppedVerbatim += num(g.dropped_verbatim);
    t.droppedAmbiguousDate += num(g.dropped_ambiguous_date);
    if (g.blocked_forbidden_vocabulary === true || g.reason === "forbidden_vocabulary") {
      t.forbiddenVocabularyBlocks++;
    }
    if (g.blocked_probability === true || g.reason === "probability_claim") {
      t.probabilityBlocks++;
    }
    if (g.schema_failed === true || g.reason === "schema_invalid") t.schemaFailures++;
    t.unsupportedSentencesRemoved += r.unsupported_sentences_removed ?? 0;
  }
  return t;
}

function DebugGuardrails() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["debug-guardrails", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("ai_outputs")
        .select(
          "id, case_id, output_type, created_at, unsupported_sentences_removed, guardrail_results",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      return (rows ?? []) as OutputRow[];
    },
  });

  const rows = data ?? [];
  const totals = tally(rows);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <p className="rounded-md border border-amber-500 bg-amber-50 px-3 py-2 text-sm">
        Development page. Counts come from stored guardrail results, not from a live check.
      </p>
      <h1 className="mt-4 text-2xl font-semibold">Guardrail activity</h1>

      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {(
              [
                ["AI responses recorded", totals.responses],
                ["Responses blocked outright", totals.blocked],
                ["Facts dropped — quote not found in source", totals.droppedVerbatim],
                ["Dates forced to unknown", totals.droppedAmbiguousDate],
                ["Forbidden-vocabulary blocks", totals.forbiddenVocabularyBlocks],
                ["Probability-claim blocks", totals.probabilityBlocks],
                ["Schema failures", totals.schemaFailures],
                ["Unsupported sentences removed", totals.unsupportedSentencesRemoved],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg border p-3">
                <dt className="text-[12px] text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <h2 className="mt-8 text-lg font-semibold">Recent responses</h2>
          <div className="mt-2 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Removed</th>
                  <th className="px-3 py-2">Guardrail result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{r.output_type}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.unsupported_sentences_removed ?? 0}
                    </td>
                    <td className="px-3 py-2">
                      <code className="text-[12px]">
                        {JSON.stringify(r.guardrail_results ?? {})}
                      </code>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-muted-foreground" colSpan={4}>
                      No AI responses recorded yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export const Route = createFileRoute("/debug/guardrails")({
  component: () => (import.meta.env.PROD ? null : <DebugGuardrails />),
});
