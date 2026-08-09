// Consultation booking (Sprint 3).
//
// CaseMap introduces someone to a lawyer. The advice happens in the
// appointment, not here. Two rules follow from that and are worth keeping in
// mind when changing anything in this file:
//
//   1. A booking carries no case data. There is no case_id on a consultation
//      and nothing here reads one. If a professional is to see the case, the
//      applicant grants that separately through sharing-service, and can
//      revoke it. Booking must never become a way around that.
//   2. Only verified, active professionals can be booked. The RLS enforces it
//      on both the slot listing and the insert; the filters here are for the
//      UI, not the guarantee.
import { supabase } from "@/integrations/supabase/client";

export type ConsultationMode = "video" | "phone" | "in_person";
export type ConsultationStatus = "booked" | "cancelled" | "completed";

export type BookableProfessional = {
  id: string;
  display_name: string | null;
  license_jurisdiction: string | null;
  languages: string[];
  consultation_blurb: string | null;
  /** When a platform admin checked this person's licence (S4-1). */
  verified_at: string | null;
  /** What they say their usual reply time is, in days (S4-4). */
  response_within_days: number | null;
};

export type OpenSlot = {
  id: string;
  professional_id: string;
  starts_at: string;
  duration_minutes: number;
  mode: ConsultationMode;
};

/** A slot as its owner sees it: with whether someone has taken it. */
export type OwnSlot = OpenSlot & { booked: boolean };

export type Consultation = {
  id: string;
  slot_id: string;
  professional_id: string;
  applicant_id: string;
  status: ConsultationStatus;
  topic: string | null;
  applicant_display_name: string | null;
  language: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
};

export type ConsultationWithSlot = Consultation & {
  starts_at: string | null;
  duration_minutes: number | null;
  mode: ConsultationMode | null;
  /** End of the slot, so "has this happened" needs no arithmetic here. */
  ends_at: string | null;
  /** Still `booked`, but the end time has passed (S4-4). */
  is_past: boolean;
  professional_name: string | null;
  jurisdiction: string | null;
};

/** Booking is closed this close to the start — nobody can attend in 2 minutes. */
export const MIN_LEAD_MINUTES = 60;

/**
 * Cap on the subject line. Deliberately below the database's 300, so a person
 * is stopped by the textarea rather than by a failed insert — and so nobody
 * mistakes this box for somewhere to put their account of what happened.
 */
export const TOPIC_MAX_LENGTH = 280;

/** Matches consultations_display_name_len. */
export const DISPLAY_NAME_MAX_LENGTH = 120;

export function isBookable(slotStartsAt: string, now: Date = new Date()): boolean {
  return new Date(slotStartsAt).getTime() - now.getTime() >= MIN_LEAD_MINUTES * 60_000;
}

// -------------------------------------------------------------------------
// Directory
// -------------------------------------------------------------------------

export async function listBookableProfessionals(filters?: {
  jurisdiction?: string | null;
  language?: string | null;
}): Promise<BookableProfessional[]> {
  // `bookable_professionals`, not `professionals`. The base table is readable
  // only by the professional themselves and by an applicant who has already
  // shared a case with them, so an applicant browsing for the first time would
  // see nothing. The view exposes five fields for verified, active
  // professionals and already filters on both flags — see
  // 20260808200000_professionals_directory.sql.
  let q = supabase
    .from("bookable_professionals")
    .select(
      "id, display_name, license_jurisdiction, languages, consultation_blurb, verified_at, response_within_days",
    );

  if (filters?.jurisdiction) q = q.eq("license_jurisdiction", filters.jurisdiction);
  if (filters?.language) q = q.contains("languages", [filters.language]);

  const { data, error } = await q.order("display_name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p) => ({
    ...p,
    languages: p.languages ?? [],
  })) as BookableProfessional[];
}

/**
 * Slots a person can actually book: published, not withdrawn, far enough
 * ahead, and not already taken.
 */
export async function listOpenSlots(professionalIds: string[]): Promise<Map<string, OpenSlot[]>> {
  const out = new Map<string, OpenSlot[]>();
  if (professionalIds.length === 0) return out;

  const [{ data: slots, error }, { data: taken }] = await Promise.all([
    supabase
      .from("consultation_slots")
      .select("id, professional_id, starts_at, duration_minutes, mode")
      .in("professional_id", professionalIds)
      .is("withdrawn_at", null)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(400),
    supabase.from("consultations").select("slot_id").eq("status", "booked"),
  ]);
  if (error) throw error;

  // A booking row is only visible to its two parties, so this set catches the
  // reader's own bookings. The partial unique index is what actually prevents
  // a double booking; this just avoids offering an obviously-taken slot.
  const bookedIds = new Set((taken ?? []).map((t: { slot_id: string }) => t.slot_id));

  for (const s of (slots ?? []) as OpenSlot[]) {
    if (bookedIds.has(s.id)) continue;
    if (!isBookable(s.starts_at)) continue;
    out.set(s.professional_id, [...(out.get(s.professional_id) ?? []), s]);
  }
  return out;
}

// -------------------------------------------------------------------------
// Booking
// -------------------------------------------------------------------------

export async function bookConsultation(input: {
  slot: OpenSlot;
  applicantId: string;
  topic: string;
  /**
   * The name to show the professional. Whatever the applicant typed, including
   * nothing: a professional cannot read anyone's profile, so this field is the
   * only name they will see.
   */
  displayName: string;
  language: string | null;
}): Promise<Consultation> {
  if (!isBookable(input.slot.starts_at)) throw new Error("slot_too_soon");

  const topic = input.topic.trim().slice(0, TOPIC_MAX_LENGTH);
  const displayName = input.displayName.trim().slice(0, DISPLAY_NAME_MAX_LENGTH);

  const { data, error } = await supabase
    .from("consultations")
    .insert({
      slot_id: input.slot.id,
      professional_id: input.slot.professional_id,
      applicant_id: input.applicantId,
      topic: topic || null,
      applicant_display_name: displayName || null,
      language: input.language,
    })
    .select("*")
    .single();

  if (error) {
    // The partial unique index is the real race guard: two people pressing
    // book at once, one wins.
    if (/duplicate key|unique/i.test(error.message)) throw new Error("slot_taken");
    throw error;
  }
  return data as Consultation;
}

export async function cancelConsultation(input: {
  consultationId: string;
  byUserId: string;
  reason: string;
}) {
  const { error } = await supabase
    .from("consultations")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: input.byUserId,
      cancel_reason: input.reason.trim() || null,
    })
    .eq("id", input.consultationId);
  if (error) throw error;
}

// -------------------------------------------------------------------------
// Reading bookings. Both sides use the same shape.
// -------------------------------------------------------------------------

/**
 * Bookings come from `consultations_with_slot`, which carries the slot times
 * and `is_past`. Only the professional's name still needs a second read, and
 * that goes through the directory view: an applicant cannot read
 * `professionals` directly, by design.
 */
async function hydrate(
  rows: Array<
    Consultation & {
      starts_at: string;
      duration_minutes: number;
      mode: ConsultationMode;
      ends_at: string;
      is_past: boolean;
    }
  >,
): Promise<ConsultationWithSlot[]> {
  if (rows.length === 0) return [];

  const { data: pros } = await supabase
    .from("bookable_professionals")
    .select("id, display_name, license_jurisdiction")
    .in(
      "id",
      rows.map((r) => r.professional_id),
    );

  const proById = new Map(
    (
      (pros ?? []) as Array<{
        id: string;
        display_name: string | null;
        license_jurisdiction: string | null;
      }>
    ).map((p) => [p.id, p]),
  );

  return rows.map((r) => {
    const p = proById.get(r.professional_id);
    return {
      ...r,
      professional_name: p?.display_name ?? null,
      jurisdiction: p?.license_jurisdiction ?? null,
    };
  });
}

const CONSULTATION_VIEW_COLS =
  "id, slot_id, professional_id, applicant_id, status, topic, applicant_display_name, language, cancelled_at, cancel_reason, created_at, starts_at, duration_minutes, mode, ends_at, is_past";

export async function listMyConsultations(applicantId: string): Promise<ConsultationWithSlot[]> {
  const { data, error } = await supabase
    .from("consultations_with_slot")
    .select(CONSULTATION_VIEW_COLS)
    .eq("applicant_id", applicantId)
    .order("starts_at", { ascending: false });
  if (error) throw error;
  return hydrate((data ?? []) as never);
}

export async function listProfessionalConsultations(
  professionalId: string,
): Promise<ConsultationWithSlot[]> {
  const { data, error } = await supabase
    .from("consultations_with_slot")
    .select(CONSULTATION_VIEW_COLS)
    .eq("professional_id", professionalId)
    .order("starts_at", { ascending: false });
  if (error) throw error;
  return hydrate((data ?? []) as never);
}

/**
 * Close out an appointment that has already happened (S4-4). Either party may
 * do it; the database refuses if the end time has not passed, so nothing can
 * be marked done in advance.
 */
export async function completeConsultation(consultationId: string) {
  const { error } = await supabase.rpc("complete_consultation", {
    p_consultation_id: consultationId,
  });
  if (error) throw error;
}

// -------------------------------------------------------------------------
// Professional availability
// -------------------------------------------------------------------------

export async function listMySlots(professionalId: string): Promise<OwnSlot[]> {
  const [{ data, error }, { data: taken }] = await Promise.all([
    supabase
      .from("consultation_slots")
      .select("id, professional_id, starts_at, duration_minutes, mode")
      .eq("professional_id", professionalId)
      .is("withdrawn_at", null)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true }),
    supabase
      .from("consultations")
      .select("slot_id")
      .eq("professional_id", professionalId)
      .eq("status", "booked"),
  ]);
  if (error) throw error;

  // Withdrawing a slot someone has already taken would strand them: the
  // booking survives, the time disappears from the professional's own list.
  // So the flag travels with the slot and the UI refuses to withdraw it.
  const bookedIds = new Set((taken ?? []).map((t: { slot_id: string }) => t.slot_id));
  return ((data ?? []) as OpenSlot[]).map((s) => ({ ...s, booked: bookedIds.has(s.id) }));
}

export async function publishSlot(input: {
  professionalId: string;
  startsAt: string;
  durationMinutes: number;
  mode: ConsultationMode;
}) {
  const { error } = await supabase.from("consultation_slots").insert({
    professional_id: input.professionalId,
    starts_at: input.startsAt,
    duration_minutes: input.durationMinutes,
    mode: input.mode,
  });
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) throw new Error("slot_exists");
    throw error;
  }
}

/** Withdraw rather than delete, so a slot that was once offered stays on record. */
export async function withdrawSlot(slotId: string) {
  const { error } = await supabase
    .from("consultation_slots")
    .update({ withdrawn_at: new Date().toISOString() })
    .eq("id", slotId);
  if (error) throw error;
}

export async function updateConsultationProfile(input: {
  professionalId: string;
  languages: string[];
  blurb: string;
  responseWithinDays: number | null;
}) {
  // Only the three columns a professional is allowed to touch. Licence,
  // jurisdiction and verified_at are held shut by a trigger — see
  // 20260809100000_professional_verification.sql — so an attempt to include
  // them here would fail loudly rather than quietly succeed.
  const { error } = await supabase
    .from("professionals")
    .update({
      languages: input.languages,
      consultation_blurb: input.blurb.trim() || null,
      response_within_days: input.responseWithinDays,
    })
    .eq("id", input.professionalId);
  if (error) throw error;
}
