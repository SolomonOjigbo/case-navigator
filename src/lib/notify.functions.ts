// Appointment notifications (S5-2, carried from S3-5).
//
// These run on the server because they need two things the browser must never
// have: the service role (to read an email address, which no RLS policy
// exposes to anyone) and the provider key.
//
// The order of operations matters and is the same in all three: claim the
// delivery row first, send second. The unique index on
// (kind, consultation_id, recipient_id) means a second attempt fails to claim
// and returns without sending, so the reminder job reminds once however often
// it runs.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * The service-role client, loaded on demand.
 *
 * A top-level import would be wrong here: this file is a `.functions.ts` and
 * so is reachable from the client bundle, and `client.server` reaches for
 * SUPABASE_SERVICE_ROLE_KEY. Same reason the AI gateway is imported this way.
 */
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Role = "applicant" | "professional";
type Kind = "consultation_booked" | "consultation_cancelled" | "consultation_reminder";

const APP_URL = () => process.env.APP_URL ?? "https://casemap.app";

/**
 * How far ahead the reminder job looks.
 *
 * This is 48 rather than 24 because the job runs **once a day** — Vercel's
 * Hobby plan allows one cron run per day, and an hourly schedule fails the
 * deployment outright. With a daily run and a 24-hour window, an appointment
 * at 09:00 tomorrow would miss today's 08:00 sweep by an hour and be picked up
 * by tomorrow's, giving the person one hour's notice for something they may
 * need to arrange childcare or time off work for.
 *
 * A 48-hour window means every appointment is caught by a sweep at least a day
 * before it starts, and at most two. Reminding slightly early is a far smaller
 * failure than reminding an hour before.
 *
 * On a plan that allows an hourly cron, narrowing this to 24 and setting the
 * schedule in vercel.json back to `0 * * * *` gives a tighter, more useful
 * reminder. Nothing else has to change: sending once is enforced by claiming a
 * row in email_deliveries, not by the schedule.
 */
export const REMINDER_WINDOW_HOURS = 48;

function formatWhen(iso: string, language: string | null): string {
  // The recipient's own language where we know it, and a fixed, unambiguous
  // shape either way: "Sat, 9 Aug 2026, 14:00". Numeric-only dates are read
  // differently in different countries and this is a date people plan around.
  try {
    return new Intl.DateTimeFormat(language ?? "en", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString();
  }
}

const MODE_TEXT: Record<string, string> = {
  video: "Video call",
  phone: "Phone call",
  in_person: "In person",
};

type Loaded = {
  consultation: {
    id: string;
    applicant_id: string;
    professional_id: string;
    topic: string | null;
    language: string | null;
    applicant_display_name: string | null;
    starts_at: string;
    mode: string;
  };
  professionalUserId: string;
  professionalName: string;
};

async function load(consultationId: string): Promise<Loaded | null> {
  const db = await admin();

  const { data: c } = await db
    .from("consultations_with_slot")
    .select(
      "id, applicant_id, professional_id, topic, language, applicant_display_name, starts_at, mode",
    )
    .eq("id", consultationId)
    .maybeSingle();
  // Every column on the view is nullable to TypeScript because a view has no
  // NOT NULL metadata; the join guarantees these in practice.
  if (!c || !c.starts_at || !c.professional_id || !c.applicant_id || !c.mode) return null;

  const { data: pro } = await db
    .from("professionals")
    .select("user_id, display_name")
    .eq("id", c.professional_id)
    .maybeSingle();
  if (!pro?.user_id) return null;

  return {
    consultation: c as Loaded["consultation"],
    professionalUserId: pro.user_id,
    professionalName: pro.display_name ?? "your lawyer",
  };
}

async function emailOf(userId: string): Promise<string | null> {
  const { data } = await (await admin()).auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

/**
 * Claim the right to send. Returns the row id, or null if someone (or an
 * earlier run) already claimed it.
 */
async function claim(input: {
  kind: Kind;
  consultationId: string;
  recipientId: string;
  role: Role;
}): Promise<string | null> {
  const { data, error } = await (
    await admin()
  )
    .from("email_deliveries")
    .insert({
      kind: input.kind,
      consultation_id: input.consultationId,
      recipient_id: input.recipientId,
      recipient_role: input.role,
      status: "queued",
    })
    .select("id")
    .single();
  if (error) return null; // unique violation: already handled
  return data.id;
}

async function finish(
  deliveryId: string,
  result: {
    status: "sent" | "skipped" | "failed";
    provider?: string;
    ref?: string | null;
    error?: string;
  },
) {
  await (
    await admin()
  )
    .from("email_deliveries")
    .update({
      status: result.status,
      provider: result.provider ?? null,
      provider_ref: result.ref ?? null,
      error: result.error ?? null,
      sent_at: result.status === "sent" ? new Date().toISOString() : null,
    })
    .eq("id", deliveryId);
}

/**
 * Send one message about one appointment to one person.
 *
 * Every failure is recorded and none is thrown: a booking must not fail
 * because a mail server was down.
 */
async function notifyOne(input: {
  kind: Kind;
  role: Role;
  loaded: Loaded;
}): Promise<"sent" | "skipped" | "failed" | "already"> {
  const { kind, role, loaded } = input;
  const { consultation } = loaded;

  const recipientId = role === "applicant" ? consultation.applicant_id : loaded.professionalUserId;
  const deliveryId = await claim({
    kind,
    consultationId: consultation.id,
    recipientId,
    role,
  });
  if (!deliveryId) return "already";

  const to = await emailOf(recipientId);
  if (!to) {
    await finish(deliveryId, { status: "failed", error: "no email address" });
    return "failed";
  }

  const { bookedMessage, cancelledMessage, reminderMessage, sendEmail } =
    await import("./email.server");

  const facts = {
    when: formatWhen(consultation.starts_at, role === "applicant" ? consultation.language : "en"),
    mode: MODE_TEXT[consultation.mode] ?? consultation.mode,
    otherName:
      role === "applicant"
        ? loaded.professionalName
        : consultation.applicant_display_name?.trim() || "Someone",
    // The professional's copy carries the subject line the applicant wrote;
    // the applicant's copy echoes their own words back. Neither carries case
    // material, because the field itself cannot hold any.
    topic: consultation.topic,
    appUrl:
      role === "applicant" ? `${APP_URL()}/app/consultations` : `${APP_URL()}/pro/availability`,
  };

  const message =
    kind === "consultation_booked"
      ? bookedMessage(facts, role)
      : kind === "consultation_cancelled"
        ? cancelledMessage(facts, role)
        : reminderMessage(facts, role);

  const result = await sendEmail({ to, ...message });
  if (result.status === "sent") {
    await finish(deliveryId, { status: "sent", provider: result.provider, ref: result.ref });
    return "sent";
  }
  if (result.status === "skipped") {
    await finish(deliveryId, { status: "skipped", error: result.reason });
    return "skipped";
  }
  await finish(deliveryId, { status: "failed", error: result.error });
  return "failed";
}

const ConsultationInput = z.object({ consultationId: z.string().uuid() });

export const notifyConsultationBooked = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ConsultationInput.parse(d))
  .handler(async ({ data }) => {
    const loaded = await load(data.consultationId);
    if (!loaded) return { ok: false as const, reason: "not_found" };
    const results = await Promise.all([
      notifyOne({ kind: "consultation_booked", role: "applicant", loaded }),
      notifyOne({ kind: "consultation_booked", role: "professional", loaded }),
    ]);
    return { ok: true as const, results };
  });

export const notifyConsultationCancelled = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ConsultationInput.parse(d))
  .handler(async ({ data }) => {
    const loaded = await load(data.consultationId);
    if (!loaded) return { ok: false as const, reason: "not_found" };
    const results = await Promise.all([
      notifyOne({ kind: "consultation_cancelled", role: "applicant", loaded }),
      notifyOne({ kind: "consultation_cancelled", role: "professional", loaded }),
    ]);
    return { ok: true as const, results };
  });

/**
 * Every appointment starting within the reminder window that nobody has been
 * reminded about. Safe to run as often as you like — the claim step is what
 * stops a second reminder, not the schedule.
 */
export async function sendDueReminders(): Promise<{
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
  already: number;
}> {
  const db = await admin();
  const now = Date.now();
  const horizon = new Date(now + REMINDER_WINDOW_HOURS * 3600_000).toISOString();

  const { data: due } = await db
    .from("consultations_with_slot")
    .select("id, starts_at")
    .eq("status", "booked")
    .gte("starts_at", new Date(now).toISOString())
    .lte("starts_at", horizon)
    .limit(500);

  const tally = { considered: (due ?? []).length, sent: 0, skipped: 0, failed: 0, already: 0 };

  for (const row of due ?? []) {
    if (!row.id) continue;
    const loaded = await load(row.id);
    if (!loaded) continue;
    for (const role of ["applicant", "professional"] as const) {
      const outcome = await notifyOne({ kind: "consultation_reminder", role, loaded });
      tally[outcome] += 1;
    }
  }
  return tally;
}

// -------------------------------------------------------------------------
// The community digest (S7-2).
//
// Runs in the same daily sweep as the appointment reminders rather than on its
// own schedule. Not for elegance: Vercel's Hobby plan allows very few cron
// jobs, and one endpoint that does the day's work is one fewer thing to
// discover has silently stopped.
//
// "Once a day" is enforced by stamping `emailed_at` on the notifications the
// message covered, not by the schedule — running the sweep twice sends one
// digest, and the second run has nothing left to report.
// -------------------------------------------------------------------------

export async function sendCommunityDigests(): Promise<{
  recipients: number;
  sent: number;
  skipped: number;
  failed: number;
}> {
  const db = await admin();
  const tally = { recipients: 0, sent: 0, skipped: 0, failed: 0 };

  // Unread, never emailed. A notification someone already read in the app is
  // not something to email them about.
  const { data: pending } = await db
    .from("community_notifications")
    .select("id, recipient_id, actor_id, topic_id, kind")
    .is("read_at", null)
    .is("emailed_at", null)
    .limit(2000);

  if (!pending?.length) return tally;

  const byRecipient = new Map<string, typeof pending>();
  for (const row of pending) {
    if (!row.recipient_id) continue;
    const list = byRecipient.get(row.recipient_id) ?? [];
    list.push(row);
    byRecipient.set(row.recipient_id, list);
  }

  const { digestMessage, sendEmail } = await import("./email.server");

  for (const [recipientId, rows] of byRecipient) {
    tally.recipients += 1;

    // The switch on the community profile, checked here rather than in the
    // query so that turning it off stops the mail without losing the
    // notifications themselves.
    const { data: profile } = await db
      .from("community_profiles")
      .select("email_digest")
      .eq("user_id", recipientId)
      .maybeSingle();
    if (profile?.email_digest === false) {
      // Stamp them anyway: they have been considered and declined, and
      // leaving them unstamped means reconsidering the same rows every day.
      await db
        .from("community_notifications")
        .update({ emailed_at: new Date().toISOString() })
        .in(
          "id",
          rows.map((r) => r.id),
        );
      tally.skipped += 1;
      continue;
    }

    const to = await emailOf(recipientId);
    if (!to) {
      tally.failed += 1;
      continue;
    }

    // Handles, never names: the digest speaks the language of the forum.
    const actorIds = [...new Set(rows.map((r) => r.actor_id))];
    const topicIds = [...new Set(rows.map((r) => r.topic_id).filter(Boolean))] as string[];

    const [{ data: handles }, { data: topics }] = await Promise.all([
      db.from("community_profiles").select("user_id, display_name, handle").in("user_id", actorIds),
      topicIds.length
        ? db.from("community_posts").select("id, title").in("id", topicIds)
        : Promise.resolve({ data: [] as Array<{ id: string; title: string | null }> }),
    ]);

    const nameOf = new Map(
      (handles ?? []).map((h) => [h.user_id, h.display_name?.trim() || `@${h.handle}`]),
    );
    const titleOf = new Map((topics ?? []).map((t) => [t.id, t.title ?? "a topic"]));

    const items = rows.map((r) => ({
      who: nameOf.get(r.actor_id) ?? "Someone",
      // Null for a direct message: the digest says one arrived and stops
      // there. Naming the conversation would name the other person twice and
      // say nothing useful.
      topic:
        r.kind === "direct_message"
          ? null
          : ((r.topic_id ? titleOf.get(r.topic_id) : null) ?? "a topic"),
    }));

    const message = digestMessage({
      items,
      appUrl: `${APP_URL()}/community/notifications`,
    });

    const result = await sendEmail({ to, ...message });
    if (result.status === "sent") tally.sent += 1;
    else if (result.status === "skipped") tally.skipped += 1;
    else tally.failed += 1;

    // Recorded like every other message this product sends. Without this the
    // only trace of a failure is a number in a cron response nobody kept —
    // which is exactly how the first live send sat unexplained.
    await db.from("email_deliveries").insert({
      kind: "community_digest",
      consultation_id: null,
      recipient_id: recipientId,
      recipient_role: "member",
      status: result.status,
      provider: result.status === "sent" ? result.provider : null,
      provider_ref: result.status === "sent" ? result.ref : null,
      error:
        result.status === "failed"
          ? result.error
          : result.status === "skipped"
            ? result.reason
            : null,
      sent_at: result.status === "sent" ? new Date().toISOString() : null,
    });

    // Stamped whatever happened. A provider outage should not mean tomorrow's
    // digest repeats today's — the notifications are still in the app.
    await db
      .from("community_notifications")
      .update({ emailed_at: new Date().toISOString() })
      .in(
        "id",
        rows.map((r) => r.id),
      );
  }

  return tally;
}
