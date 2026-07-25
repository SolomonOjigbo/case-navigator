// GATE 1 — a low-confidence, unconfirmed AI-extracted fact must NEVER become
// an event. The rule is enforced BOTH here (in the code path) and in the
// database (see the event_sources_gate1 trigger created in the migration
// alongside this file). Both layers exist on purpose: the trigger cannot be
// bypassed by a bad client, and the guard here gives a clear early error
// with a message the UI can show to the applicant.
//
// Why 0.75? See knowledge base: AI output is a proposal, not a decision.
// A fact must be either "human-confirmed" OR "the model was reasonably
// sure and the applicant has at least been shown it" before it can shape
// the timeline a professional will review. Marking the fact "I'm not sure"
// counts as NOT confirmed; the fact stays visible but off the timeline.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

    // ---- GATE 1 (client-side layer) -------------------------------------
    if (fact.stale || fact.superseded_by_id) {
      throw new Error("gate1: fact is stale or superseded");
    }
    if (fact.user_marked_unsure && !fact.user_confirmed) {
      throw new Error("gate1: applicant marked this detail as unsure");
    }
    if (!fact.user_confirmed && Number(fact.extraction_confidence) < 0.75) {
      throw new Error(
        "gate1: detail must be confirmed by the applicant before it can become an event",
      );
    }
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