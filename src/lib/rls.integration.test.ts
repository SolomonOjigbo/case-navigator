// Real Supabase RLS tests. These are the access-control checks that cannot be
// proved with a mock: a mock would only assert what we already believe.
//
// OPT-IN. They are skipped unless RLS_TEST=1 and test credentials are present,
// because they sign in as real accounts and read real rows. Never point them at
// a project holding anyone's actual case material.
//
//   RLS_TEST=1 \
//   RLS_SUPABASE_URL=... RLS_SUPABASE_ANON_KEY=... \
//   RLS_APPLICANT_A_EMAIL=... RLS_APPLICANT_A_PASSWORD=... \
//   RLS_APPLICANT_B_EMAIL=... RLS_APPLICANT_B_PASSWORD=... \
//   RLS_PRO_EMAIL=... RLS_PRO_PASSWORD=... \
//   RLS_CASE_A_ID=... RLS_UNGRANTED_CASE_ID=... \
//   npm test
//
// Seed a local stack with supabase/seed.sql first.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it, vi } from "vitest";

// Each test signs in two or three accounts against a hosted project, so the
// 5s default is not enough. Applies to this file only.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });

const env = process.env;
const enabled =
  env.RLS_TEST === "1" &&
  !!env.RLS_SUPABASE_URL &&
  !!env.RLS_SUPABASE_ANON_KEY &&
  !!env.RLS_APPLICANT_A_EMAIL &&
  !!env.RLS_APPLICANT_B_EMAIL &&
  !!env.RLS_PRO_EMAIL;

const d = enabled ? describe : describe.skip;

const clients: SupabaseClient[] = [];

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(env.RLS_SUPABASE_URL!, env.RLS_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  clients.push(client);
  return client;
}

afterAll(async () => {
  await Promise.all(clients.map((c) => c.auth.signOut()));
});

d("RLS — one applicant cannot reach another applicant's case", () => {
  it("returns zero rows across every case-scoped table", async () => {
    const b = await signIn(env.RLS_APPLICANT_B_EMAIL!, env.RLS_APPLICANT_B_PASSWORD!);
    const caseA = env.RLS_CASE_A_ID!;

    for (const table of [
      "story_responses",
      "documents",
      "events",
      "extracted_facts",
      "evidence_event_links",
      "clarification_items",
      "audit_events",
    ]) {
      const { data, error } = await b.from(table).select("id").eq("case_id", caseA);
      // RLS filters rather than erroring: the correct result is an empty set.
      expect(error, `${table} should not error`).toBeNull();
      expect(data ?? [], `${table} leaked rows to another applicant`).toHaveLength(0);
    }
  });

  it("cannot read the other applicant's case row itself", async () => {
    const b = await signIn(env.RLS_APPLICANT_B_EMAIL!, env.RLS_APPLICANT_B_PASSWORD!);
    const { data } = await b.from("cases").select("id").eq("id", env.RLS_CASE_A_ID!);
    expect(data ?? []).toHaveLength(0);
  });
});

d("RLS — a professional with no grant sees nothing", () => {
  it("returns zero rows for a case they were never granted", async () => {
    const pro = await signIn(env.RLS_PRO_EMAIL!, env.RLS_PRO_PASSWORD!);
    const ungranted = env.RLS_UNGRANTED_CASE_ID!;
    for (const table of ["story_responses", "documents", "events"]) {
      const { data } = await pro.from(table).select("id").eq("case_id", ungranted);
      expect(data ?? [], `${table} leaked to an ungranted professional`).toHaveLength(0);
    }
  });
});

d("RLS — private hold is invisible to professionals under any grant", () => {
  it("never returns a private_hold row, and leaks no category", async () => {
    const pro = await signIn(env.RLS_PRO_EMAIL!, env.RLS_PRO_PASSWORD!);
    const caseA = env.RLS_CASE_A_ID!;

    const { data: docs } = await pro
      .from("documents")
      .select("id, private_hold")
      .eq("case_id", caseA);
    expect((docs ?? []).some((r) => r.private_hold)).toBe(false);

    const { data: held } = await pro
      .from("documents")
      .select("id")
      .eq("case_id", caseA)
      .eq("private_hold", true);
    expect(held ?? []).toHaveLength(0);

    const { data: story } = await pro
      .from("story_responses")
      .select("id")
      .eq("case_id", caseA)
      .eq("private_hold", true);
    expect(story ?? []).toHaveLength(0);
  });
});

d("RLS — an expired or revoked grant ends access immediately", () => {
  it("returns zero rows once the grant is revoked", async () => {
    const applicant = await signIn(env.RLS_APPLICANT_A_EMAIL!, env.RLS_APPLICANT_A_PASSWORD!);
    const pro = await signIn(env.RLS_PRO_EMAIL!, env.RLS_PRO_PASSWORD!);
    const caseA = env.RLS_CASE_A_ID!;

    const { data: before } = await pro.from("events").select("id").eq("case_id", caseA);
    expect((before ?? []).length, "professional should start with access").toBeGreaterThan(0);

    const { data: grants } = await applicant
      .from("sharing_grants")
      .select("id")
      .eq("case_id", caseA)
      .is("revoked_at", null);
    const grantId = (grants ?? [])[0]?.id;
    expect(grantId, "expected an active grant to revoke").toBeTruthy();

    await applicant
      .from("sharing_grants")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", grantId!);

    const { data: after } = await pro.from("events").select("id").eq("case_id", caseA);
    expect(after ?? [], "revocation did not end access").toHaveLength(0);

    // Restore so the fixture stays usable for the next run.
    await applicant.from("sharing_grants").update({ revoked_at: null }).eq("id", grantId!);
  });
});

d("Gate 2 — an export cannot be created without an approving professional", () => {
  it("rejects an export_packages insert with no professional_approved_by", async () => {
    const applicant = await signIn(env.RLS_APPLICANT_A_EMAIL!, env.RLS_APPLICANT_A_PASSWORD!);
    const { error } = await applicant.from("export_packages").insert({
      case_id: env.RLS_CASE_A_ID!,
      created_by: "00000000-0000-4000-8000-000000000000",
      format: "html",
      scopes: ["timeline"],
      storage_path: "should/never/exist.html",
      sha256: "0".repeat(64),
      professional_approved_by: null,
    } as never);
    expect(error, "an unapproved export was accepted").not.toBeNull();
  });
});

d("append-only tables reject UPDATE and DELETE", () => {
  it("refuses to update document_versions or delete audit_events", async () => {
    const applicant = await signIn(env.RLS_APPLICANT_A_EMAIL!, env.RLS_APPLICANT_A_PASSWORD!);
    const caseA = env.RLS_CASE_A_ID!;

    const { data: docs } = await applicant
      .from("documents")
      .select("id")
      .eq("case_id", caseA)
      .limit(1);
    const docId = (docs ?? [])[0]?.id;
    if (docId) {
      const { data: versions } = await applicant
        .from("document_versions")
        .select("id")
        .eq("document_id", docId)
        .limit(1);
      const versionId = (versions ?? [])[0]?.id;
      if (versionId) {
        const { error, data } = await applicant
          .from("document_versions")
          .update({ sha256: "tampered" })
          .eq("id", versionId)
          .select("id");
        // Either an explicit error, or zero rows affected — never a success.
        expect(error !== null || (data ?? []).length === 0).toBe(true);
      }
    }

    const { data: deleted } = await applicant
      .from("audit_events")
      .delete()
      .eq("case_id", caseA)
      .select("id");
    expect(deleted ?? []).toHaveLength(0);
  });
});

d("RLS — booking a consultation does not open the case (S3 acceptance)", () => {
  it("lets the professional see the booking and nothing else about the person", async () => {
    const pro = await signIn(env.RLS_PRO_EMAIL!, env.RLS_PRO_PASSWORD!);
    const applicantB = await signIn(env.RLS_APPLICANT_B_EMAIL!, env.RLS_APPLICANT_B_PASSWORD!);
    const applicantA = await signIn(env.RLS_APPLICANT_A_EMAIL!, env.RLS_APPLICANT_A_PASSWORD!);

    const { data: me } = await pro
      .from("professionals")
      .select("id, verified_at, active")
      .limit(1)
      .maybeSingle();
    expect(me?.id, "the test professional has no professionals row").toBeTruthy();
    expect(me?.verified_at, "fixture professional must be verified to be bookable").toBeTruthy();
    const proId = me!.id as string;

    // The directory shows a lawyer to someone who has shared nothing with
    // them, and the underlying table still does not.
    const { data: listed } = await applicantB
      .from("bookable_professionals")
      .select("id, display_name")
      .eq("id", proId);
    expect(listed ?? [], "a verified professional is not listed in the directory").toHaveLength(1);
    const { data: rawRow } = await applicantB.from("professionals").select("id").eq("id", proId);
    expect(rawRow ?? [], "the professionals table itself leaked to an applicant").toHaveLength(0);

    // A start time far enough ahead to clear MIN_LEAD_MINUTES, and unique so
    // consultation_slots_unique_start does not collide with a previous run.
    const startsAt = new Date(Date.now() + 26 * 3600_000 + (Date.now() % 600_000)).toISOString();

    const { data: slot, error: slotErr } = await pro
      .from("consultation_slots")
      .insert({ professional_id: proId, starts_at: startsAt, duration_minutes: 30, mode: "video" })
      .select("id, professional_id, starts_at")
      .single();
    expect(slotErr, "the professional could not publish a slot").toBeNull();
    const slotId = slot!.id as string;

    try {
      // The slot is visible to a signed-in applicant, because the professional
      // is verified and active.
      const { data: visible } = await applicantB
        .from("consultation_slots")
        .select("id")
        .eq("id", slotId);
      expect(visible ?? [], "a verified professional's open slot was not offered").toHaveLength(1);

      const uidB = (await applicantB.auth.getUser()).data.user!.id;
      const uidA = (await applicantA.auth.getUser()).data.user!.id;

      // Nobody can book on someone else's behalf: the WITH CHECK pins
      // applicant_id to the caller.
      const { error: impostorErr } = await applicantB
        .from("consultations")
        .insert({ slot_id: slotId, professional_id: proId, applicant_id: uidA })
        .select("id");
      expect(impostorErr, "an applicant booked in another person's name").not.toBeNull();

      const { data: booking, error: bookErr } = await applicantB
        .from("consultations")
        .insert({
          slot_id: slotId,
          professional_id: proId,
          applicant_id: uidB,
          topic: "questions about a hearing date",
          language: "en",
        })
        .select("id")
        .single();
      expect(bookErr, "an applicant could not book a verified professional").toBeNull();
      expect(booking?.id).toBeTruthy();

      // The professional sees the appointment.
      const { data: proSees } = await pro
        .from("consultations")
        .select("id, topic, applicant_id")
        .eq("slot_id", slotId);
      expect(proSees ?? [], "the professional cannot see their own booking").toHaveLength(1);

      // ...and still sees nothing of that person's case. This is the whole
      // point of the design: a booking is not a grant.
      const ungranted = env.RLS_UNGRANTED_CASE_ID!;
      for (const table of [
        "story_responses",
        "documents",
        "events",
        "extracted_facts",
        "clarification_items",
      ]) {
        const { data } = await pro.from(table).select("id").eq("case_id", ungranted);
        expect(data ?? [], `booking leaked ${table} to the professional`).toHaveLength(0);
      }

      // There is no column that could carry case material, so no future change
      // can quietly start using one.
      const { error: noCaseCol } = await pro
        .from("consultations")
        .select("case_id" as never)
        .limit(1);
      expect(noCaseCol, "consultations has gained a case reference").not.toBeNull();

      // A third party sees neither the booking nor who made it.
      const { data: otherSees } = await applicantA
        .from("consultations")
        .select("id")
        .eq("slot_id", slotId);
      expect(otherSees ?? [], "a booking leaked to an unrelated applicant").toHaveLength(0);

      // And the slot cannot be taken twice.
      const { error: doubleErr } = await applicantA
        .from("consultations")
        .insert({ slot_id: slotId, professional_id: proId, applicant_id: uidA })
        .select("id");
      expect(doubleErr, "the same slot was booked twice").not.toBeNull();
    } finally {
      // Deleting the slot cascades to the consultation, so the fixture is
      // clean for the next run.
      await pro.from("consultation_slots").delete().eq("id", slotId);
    }
  });
});
