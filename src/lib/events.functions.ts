// GATE 1 — a low-confidence, unconfirmed AI-extracted fact must NEVER become
// an event. The rule is enforced BOTH here (in the code path) and in the
// database (see the event_sources_gate1 trigger created in the migration
// alongside this file). Both layers exist on purpose: the trigger cannot be
// bypassed by a bad client, and the guard here gives a clear early error
// with a message the UI can show to the applicant.
//
// The predicate itself lives in gate1.ts so every call site shares it.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkGate1 } from "./gate1";

const InputSchema = z.object({
  factId: z.string().uuid(),
  title: z.string().min(1),
});

function shortRef(prefix: string, id: string) {
  return `${prefix}-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export const createEventFromFact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: fact, error } = await supabase
      .from("extracted_facts")
      .select(
        "id, case_id, source_id, extraction_confidence, user_confirmed, user_marked_unsure, stale, superseded_by_id, value_text, value_structured",
      )
      .eq("id", data.factId)
      .maybeSingle();
    if (error) throw error;
    if (!fact) throw new Error("fact not found");

    // ---- GATE 1 (server-side layer) --------------------------------------
    const gate = checkGate1(fact);
    if (!gate.allowed) throw new Error(gate.reason);
    // The database trigger event_sources_gate1 re-checks the same rule on
    // INSERT, so a client that skipped this guard still cannot bypass Gate 1.
    // ---------------------------------------------------------------------

    const eventId = crypto.randomUUID();
    const { error: evErr } = await supabase.from("events").insert({
      id: eventId,
      case_id: fact.case_id,
      reference_code: shortRef("EVT", eventId),
      title: data.title,
      provenance: fact.user_confirmed ? "user_confirmed" : "ai_extracted",
      user_confirmed: fact.user_confirmed,
    });
    if (evErr) throw evErr;

    const { error: linkErr } = await supabase.from("event_sources").insert({
      event_id: eventId,
      source_id: fact.source_id,
      fact_id: fact.id,
    });
    if (linkErr) throw linkErr;

    return { ok: true, eventId };
  });
