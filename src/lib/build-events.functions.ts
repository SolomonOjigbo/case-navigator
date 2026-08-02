// build-events — clusters CONFIRMED (Gate-1 eligible) facts into candidate
// events. This is a proposal step: every event lands with status "unsupported"
// unless evidence is linked, and reviews still happen elsewhere.
//
// Rules baked into the prompt AND double-checked in code below:
//   - every event needs at least one fact/source
//   - do NOT merge two facts into one event unless the material links them;
//     when unsure, emit TWO events with possible_divergence = true
//   - NEVER estimate a date to make ordering easier
//   - anything the applicant fears may happen goes to feared_future_event
//     and is excluded from the past timeline (ordering is SQL, not AI)
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FORBIDDEN_VOCABULARY, PROBABILITY_PATTERNS } from "./ai-prompts";
import { passesGate1 } from "./gate1";

import { AI_MODEL as MODEL } from "./ai-model";
export const BUILD_EVENTS_PROMPT_VERSION = "build-events@2026-07-25.1";

const InputSchema = z.object({ caseId: z.string().uuid() });

const EventProposal = z.object({
  title: z.string().min(1),
  date_start: z.string().nullable(),
  date_end: z.string().nullable(),
  date_certainty: z.enum(["exact", "approximate", "range", "season", "unknown"]),
  location_name: z.string().nullable(),
  user_description: z.string(),
  section_key: z.string().nullable(),
  feared_future_event: z.boolean(),
  possible_divergence: z.boolean(),
  fact_ids: z.array(z.string().uuid()).min(1),
});
const ProposalResponse = z.object({
  events: z.array(EventProposal),
  notes: z.array(z.string()).default([]),
});

function shortRef(prefix: string, id: string) {
  return `${prefix}-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function walkStrings(v: unknown, visit: (s: string) => void) {
  if (typeof v === "string") return visit(v);
  if (Array.isArray(v)) return v.forEach((x) => walkStrings(x, visit));
  if (v && typeof v === "object") for (const x of Object.values(v)) walkStrings(x, visit);
}
function hasForbidden(text: string): string | null {
  const lower = text.toLowerCase();
  for (const w of FORBIDDEN_VOCABULARY) if (lower.includes(w.toLowerCase())) return w;
  return null;
}
function hasProbability(text: string): string | null {
  for (const p of PROBABILITY_PATTERNS) {
    const m = p.exec(text);
    if (m) return m[0];
  }
  return null;
}

const SYSTEM = `You are an assistant that GROUPS already-checked details into candidate events for a legal professional to review.
You are NOT a lawyer, NOT an adjudicator, and NOT a translator of certified documents.

ABSOLUTE PROHIBITIONS — never do any of these:
- Do not decide, suggest, or hint whether the person qualifies for protection.
- Do not predict outcomes. No percentages, probabilities, likelihoods, or odds.
- Do not comment on credibility, believability, truthfulness, or honesty.
- Do not label anything authentic, genuine, verified, official, or fraudulent.
- Do not invent facts, dates, names, places, or details not in the inputs.
- Do not tell the person what to say, add, omit, or reword.

CLUSTERING RULES (follow strictly):
- Every event MUST include at least one fact_id from the input.
- Do NOT merge two facts into one event unless the material clearly links them
  (same time, same place, same actors, same incident). When unsure, output TWO
  events and set possible_divergence = true on both.
- NEVER estimate or guess a date to make events easier to order. If the date is
  not clearly present in the facts, set date_start = null, date_end = null, and
  date_certainty = "unknown".
- Anything the applicant fears MAY happen in the future is not a past event:
  set feared_future_event = true and still list the supporting fact_ids.
- Copy the applicant's wording into user_description where possible; do not
  paraphrase, summarise, or rewrite their words.

Return ONLY valid JSON matching the requested schema.`;

function buildUserPrompt(facts: Array<Record<string, unknown>>): string {
  return `Here are the checked details for one case. Group them into candidate events.

Rules for the output:
- title: short neutral label (max 80 characters).
- date_start / date_end: ISO YYYY-MM-DD or null. NEVER guess.
- date_certainty: one of exact|approximate|range|season|unknown.
- location_name: nullable string, copied from the facts.
- user_description: the applicant's own words about this event, copied verbatim.
- section_key: the story section this best belongs to, or null.
- feared_future_event: true if this is something the applicant fears may happen, not something that already happened.
- possible_divergence: true if you were unsure whether two facts belong to the same event.
- fact_ids: the input fact ids that support this event (at least one).

Facts:
${JSON.stringify(facts, null, 2)}

Return JSON of shape:
{ "events": [ { "title": "", "date_start": null, "date_end": null, "date_certainty": "unknown", "location_name": null, "user_description": "", "section_key": null, "feared_future_event": false, "possible_divergence": false, "fact_ids": [] } ], "notes": [] }`;
}

async function callModel(facts: Array<Record<string, unknown>>): Promise<unknown> {
  const { callModelJSON } = await import("./ai-gateway.server");
  try {
    return await callModelJSON({ system: SYSTEM, user: buildUserPrompt(facts) });
  } catch (err) {
    if (err instanceof SyntaxError) return { events: [], notes: ["parse_error"] };
    throw err;
  }
}

export const buildEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: caseRow, error: caseErr } = await supabase
      .from("cases")
      .select("id, applicant_id")
      .eq("id", data.caseId)
      .maybeSingle();
    if (caseErr) throw caseErr;
    if (!caseRow || caseRow.applicant_id !== userId) throw new Error("case not found");

    const { data: consentOk, error: consentErr } = await supabase.rpc("has_active_consent", {
      _user_id: userId,
      _consent_type: "ai_processing",
    });
    if (consentErr) throw consentErr;
    if (!consentOk) throw new Error("consent_required:ai_processing");

    // Gate 1 filter: only user_confirmed OR (confidence >= 0.75 AND not
    // marked unsure). Stale / superseded facts are excluded.
    const { data: factsRaw, error: fErr } = await supabase
      .from("extracted_facts")
      .select(
        "id, source_id, fact_type, value_text, original_wording, extraction_confidence, user_confirmed, user_marked_unsure, value_structured",
      )
      .eq("case_id", data.caseId)
      .eq("stale", false)
      .is("superseded_by_id", null);
    if (fErr) throw fErr;
    const facts = (factsRaw ?? []).filter((f) =>
      passesGate1({
        extraction_confidence: f.extraction_confidence,
        user_confirmed: f.user_confirmed,
        user_marked_unsure: f.user_marked_unsure,
        stale: false,
        superseded_by_id: null,
      }),
    );
    if (facts.length === 0) return { ok: true as const, created: 0, notes: ["no_eligible_facts"] };

    // Look up section_key from story_responses when the source is a story answer.
    const sourceIds = Array.from(new Set(facts.map((f) => f.source_id)));
    const { data: srcs } = await supabase
      .from("sources")
      .select("id, source_type, reference_id")
      .in("id", sourceIds);
    const storyRefIds = (srcs ?? [])
      .filter((s) => s.source_type === "story_response")
      .map((s) => s.reference_id);
    const storyMap = new Map<string, string>();
    if (storyRefIds.length > 0) {
      const { data: stories } = await supabase
        .from("story_responses")
        .select("id, section_key")
        .in("id", storyRefIds);
      for (const r of stories ?? []) storyMap.set(r.id as string, r.section_key as string);
    }
    const srcTypeById = new Map((srcs ?? []).map((s) => [s.id as string, s.source_type as string]));
    const srcRefById = new Map((srcs ?? []).map((s) => [s.id as string, s.reference_id as string]));

    const promptFacts = facts.map((f) => ({
      id: f.id,
      fact_type: f.fact_type,
      value_text: f.value_text,
      original_wording: f.original_wording,
      date: (f.value_structured as { date?: unknown } | null)?.date ?? null,
      user_confirmed: f.user_confirmed,
      section_key:
        srcTypeById.get(f.source_id) === "story_response"
          ? (storyMap.get(srcRefById.get(f.source_id) ?? "") ?? null)
          : null,
    }));

    const raw = await callModel(promptFacts);
    const parsed = ProposalResponse.safeParse(raw);

    const incidents: string[] = [];
    let blocked = false;
    if (!parsed.success) {
      incidents.push(`schema:${parsed.error.issues[0]?.message ?? "invalid"}`);
      blocked = true;
    } else {
      walkStrings(parsed.data, (s) => {
        if (!blocked) {
          const fv = hasForbidden(s);
          if (fv) {
            incidents.push(`forbidden_vocab:${fv}`);
            blocked = true;
            return;
          }
          const pv = hasProbability(s);
          if (pv) {
            incidents.push(`probability:${pv}`);
            blocked = true;
          }
        }
      });
    }

    await supabase.from("ai_outputs").insert({
      case_id: data.caseId,
      output_type: "chronological_summary",
      version: 1,
      content: parsed.success ? parsed.data : { blocked: true },
      citation_map: { fact_ids: facts.map((f) => f.id) },
      model_id: MODEL,
      prompt_version: BUILD_EVENTS_PROMPT_VERSION,
      input_source_ids: sourceIds,
      guardrail_results: { incidents, blocked },
    });

    if (blocked || !parsed.success) {
      return { ok: false as const, reason: "guardrail_blocked", incidents };
    }

    const eligibleFactIds = new Set(facts.map((f) => f.id));
    const factSourceById = new Map(facts.map((f) => [f.id, f.source_id]));
    const factConfirmedById = new Map(facts.map((f) => [f.id, f.user_confirmed]));

    // NEVER let AI decide the guessed date. If date_certainty is not exact/
    // approximate/range/season with real dates, force nulls.
    let created = 0;
    for (const ev of parsed.data.events) {
      const factIds = ev.fact_ids.filter((id) => eligibleFactIds.has(id));
      if (factIds.length === 0) continue;

      const eventId = crypto.randomUUID();
      const anyUnconfirmed = factIds.some((id) => !factConfirmedById.get(id));
      const provenance = anyUnconfirmed ? "ai_inferred" : "ai_extracted";

      // "never estimate a date to make ordering easier" — enforce here.
      const dateStart = ev.date_certainty === "unknown" ? null : ev.date_start;
      const dateEnd = ev.date_certainty === "unknown" ? null : ev.date_end;

      const { error: evErr } = await supabase.from("events").insert({
        id: eventId,
        case_id: data.caseId,
        reference_code: shortRef("EVT", eventId),
        title: ev.title.slice(0, 200),
        date_start: dateStart,
        date_end: dateEnd,
        date_certainty: ev.date_certainty,
        location_name: ev.location_name,
        user_description: ev.user_description,
        provenance,
        unsupported: true,
        possible_divergence: ev.possible_divergence,
        feared_future_event: ev.feared_future_event,
        user_confirmed: false,
        section_key: ev.section_key,
      });
      if (evErr) continue;

      const linkRows = factIds.map((fid) => ({
        event_id: eventId,
        source_id: factSourceById.get(fid)!,
        fact_id: fid,
      }));
      // Gate 1 trigger on event_sources will re-check every insert; a bad row
      // simply fails and the rest of the event still stands.
      await supabase.from("event_sources").insert(linkRows);
      created++;
    }

    return { ok: true as const, created, notes: parsed.data.notes };
  });

// -------------------------------------------------------------------------
// Manual timeline operations (add / edit / delete AI / confirm)
// -------------------------------------------------------------------------

const AddEventSchema = z.object({
  caseId: z.string().uuid(),
  title: z.string().min(1),
  dateStart: z.string().nullable(),
  dateEnd: z.string().nullable(),
  dateCertainty: z.enum(["exact", "approximate", "range", "season", "unknown"]),
  locationName: z.string().nullable(),
  userDescription: z.string(),
  sectionKey: z.string().nullable(),
  fearedFutureEvent: z.boolean(),
});

export const addEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AddEventSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: caseRow } = await supabase
      .from("cases")
      .select("id, applicant_id")
      .eq("id", data.caseId)
      .maybeSingle();
    if (!caseRow || caseRow.applicant_id !== userId) throw new Error("case not found");
    const id = crypto.randomUUID();
    const { error } = await supabase.from("events").insert({
      id,
      case_id: data.caseId,
      reference_code: shortRef("EVT", id),
      title: data.title,
      date_start: data.dateCertainty === "unknown" ? null : data.dateStart,
      date_end: data.dateCertainty === "unknown" ? null : data.dateEnd,
      date_certainty: data.dateCertainty,
      location_name: data.locationName,
      user_description: data.userDescription,
      provenance: "user_stated",
      unsupported: true,
      user_confirmed: true,
      feared_future_event: data.fearedFutureEvent,
      section_key: data.sectionKey,
    });
    if (error) throw error;
    return { ok: true, eventId: id };
  });

const EditEventSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string().min(1).optional(),
  dateStart: z.string().nullable().optional(),
  dateEnd: z.string().nullable().optional(),
  dateCertainty: z.enum(["exact", "approximate", "range", "season", "unknown"]).optional(),
  locationName: z.string().nullable().optional(),
  userDescription: z.string().optional(),
  sectionKey: z.string().nullable().optional(),
});

// Editing user_description preserves the original wording: we insert a NEW
// event row (version + 1, supersedes_id = old.id) and mark the old row stale.
// Other field-only edits update in place.
export const editEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => EditEventSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: current, error: readErr } = await supabase
      .from("events")
      .select(
        "id, case_id, reference_code, title, date_start, date_end, date_certainty, date_calendar, location_name, user_description, neutral_summary, consequences, provenance, unsupported, possible_divergence, feared_future_event, user_confirmed, private_hold, section_key, version",
      )
      .eq("id", data.eventId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!current) throw new Error("event not found");

    const descChanged =
      data.userDescription !== undefined &&
      data.userDescription !== (current.user_description ?? "");

    if (!descChanged) {
      const patch: Partial<{
        title: string;
        date_certainty: string;
        date_start: string | null;
        date_end: string | null;
        location_name: string | null;
        section_key: string | null;
      }> = {};
      if (data.title !== undefined) patch.title = data.title;
      if (data.dateCertainty !== undefined) patch.date_certainty = data.dateCertainty;
      if (data.dateStart !== undefined) patch.date_start = data.dateStart;
      if (data.dateEnd !== undefined) patch.date_end = data.dateEnd;
      if (data.dateCertainty === "unknown") {
        patch.date_start = null;
        patch.date_end = null;
      }
      if (data.locationName !== undefined) patch.location_name = data.locationName;
      if (data.sectionKey !== undefined) patch.section_key = data.sectionKey;
      if (Object.keys(patch).length === 0) return { ok: true, eventId: current.id };
      const { error } = await supabase.from("events").update(patch).eq("id", current.id);
      if (error) throw error;
      return { ok: true, eventId: current.id };
    }

    // Description changed — create a new version so the applicant's original
    // words remain in the audit trail.
    const newId = crypto.randomUUID();
    const merged = {
      id: newId,
      case_id: current.case_id,
      reference_code: shortRef("EVT", newId),
      title: data.title ?? current.title,
      date_certainty: data.dateCertainty ?? current.date_certainty,
      date_start:
        (data.dateCertainty ?? current.date_certainty) === "unknown"
          ? null
          : data.dateStart !== undefined
            ? data.dateStart
            : current.date_start,
      date_end:
        (data.dateCertainty ?? current.date_certainty) === "unknown"
          ? null
          : data.dateEnd !== undefined
            ? data.dateEnd
            : current.date_end,
      date_calendar: current.date_calendar,
      location_name: data.locationName !== undefined ? data.locationName : current.location_name,
      user_description: data.userDescription!,
      neutral_summary: current.neutral_summary,
      consequences: current.consequences,
      provenance: "user_stated",
      unsupported: current.unsupported,
      possible_divergence: current.possible_divergence,
      feared_future_event: current.feared_future_event,
      user_confirmed: true,
      private_hold: current.private_hold,
      section_key: data.sectionKey !== undefined ? data.sectionKey : current.section_key,
      version: (current.version ?? 1) + 1,
      supersedes_id: current.id,
    };
    const { error: insErr } = await supabase.from("events").insert(merged);
    if (insErr) throw insErr;

    const { data: links } = await supabase
      .from("event_sources")
      .select("source_id, fact_id")
      .eq("event_id", current.id);
    if (links && links.length > 0) {
      await supabase
        .from("event_sources")
        .insert(
          links.map((l) => ({ event_id: newId, source_id: l.source_id, fact_id: l.fact_id })),
        );
    }

    await supabase.from("events").update({ stale: true }).eq("id", current.id);

    return { ok: true, eventId: newId };
  });

const IdOnly = z.object({ eventId: z.string().uuid() });

// Only AI-suggested events can be deleted outright; user-authored events are
// versioned via editEvent above and never destroyed.
export const deleteAiEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdOnly.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: current } = await supabase
      .from("events")
      .select("id, provenance")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!current) throw new Error("event not found");
    if (current.provenance !== "ai_extracted" && current.provenance !== "ai_inferred") {
      throw new Error("only AI-suggested events can be deleted");
    }
    const { error } = await supabase.from("events").delete().eq("id", data.eventId);
    if (error) throw error;
    return { ok: true };
  });

export const confirmEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdOnly.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("events")
      .update({ user_confirmed: true })
      .eq("id", data.eventId);
    if (error) throw error;
    return { ok: true };
  });
