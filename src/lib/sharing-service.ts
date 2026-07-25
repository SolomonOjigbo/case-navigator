import { supabase } from "@/integrations/supabase/client";
import { writeAudit } from "./audit-service";

export type Scope = "story" | "documents" | "timeline" | "evidence_map" | "questions" | "attention";
export const ALL_SCOPES: Scope[] = [
  "story",
  "documents",
  "timeline",
  "evidence_map",
  "questions",
  "attention",
];

export type ProfessionalListing = {
  id: string;
  user_id: string;
  display_name: string | null;
  license_number: string | null;
  license_jurisdiction: string | null;
  verified_at: string | null;
};

export async function listVerifiedProfessionals(): Promise<ProfessionalListing[]> {
  const { data, error } = await supabase
    .from("professionals")
    .select("id, user_id, display_name, license_number, license_jurisdiction, verified_at")
    .eq("active", true)
    .not("verified_at", "is", null)
    .order("display_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProfessionalListing[];
}

export async function listGrants(caseId: string) {
  const { data, error } = await supabase
    .from("sharing_grants")
    .select(
      "id, professional_id, scopes, purpose_note, starts_at, expires_at, revoked_at, created_at, professionals!inner(display_name, license_jurisdiction)",
    )
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createGrant(input: {
  caseId: string;
  userId: string;
  professionalId: string;
  scopes: Scope[];
  expiresAt: string;
  purposeNote?: string;
}) {
  const { data, error } = await supabase
    .from("sharing_grants")
    .insert({
      case_id: input.caseId,
      professional_id: input.professionalId,
      scopes: input.scopes,
      purpose_note: input.purposeNote ?? null,
      starts_at: new Date().toISOString(),
      expires_at: input.expiresAt,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error) throw error;

  // Consent record for the sharing action
  await supabase.from("consent_records").insert({
    case_id: input.caseId,
    applicant_id: input.userId,
    consent_type: "professional_sharing",
    consent_text_version: "v1-2026-07-25",
    granted: true,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  });

  await writeAudit({
    userId: input.userId,
    caseId: input.caseId,
    action: "consent.grant",
    targetType: "sharing_grant",
    targetId: data.id,
    metadata: { scopes: input.scopes, expires_at: input.expiresAt },
  });

  return data.id;
}

export async function revokeGrant(input: {
  grantId: string;
  userId: string;
  caseId: string;
}) {
  const { error } = await supabase
    .from("sharing_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", input.grantId);
  if (error) throw error;
  await writeAudit({
    userId: input.userId,
    caseId: input.caseId,
    action: "consent.revoke",
    targetType: "sharing_grant",
    targetId: input.grantId,
  });
}

export type PrivateHoldItem = {
  kind: "story" | "document" | "event";
  id: string;
  label: string;
  detail?: string | null;
};

export async function listPrivateHold(caseId: string): Promise<PrivateHoldItem[]> {
  const [stories, docs, events] = await Promise.all([
    supabase
      .from("story_responses")
      .select("id, prompt_code, reference_code, body_text, private_hold, created_at")
      .eq("case_id", caseId)
      .eq("private_hold", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("documents")
      .select("id, reference_code, original_filename, private_hold")
      .eq("case_id", caseId)
      .eq("private_hold", true),
    supabase
      .from("events")
      .select("id, reference_code, title, private_hold")
      .eq("case_id", caseId)
      .eq("private_hold", true),
  ]);
  const items: PrivateHoldItem[] = [];
  for (const r of stories.data ?? []) {
    items.push({
      kind: "story",
      id: r.id,
      label: r.reference_code,
      detail: r.prompt_code,
    });
  }
  for (const r of docs.data ?? []) {
    items.push({ kind: "document", id: r.id, label: r.reference_code, detail: r.original_filename });
  }
  for (const r of events.data ?? []) {
    items.push({ kind: "event", id: r.id, label: r.reference_code, detail: r.title });
  }
  return items;
}

export type SharePreview = {
  story: { total: number; onHold: number };
  documents: { total: number; onHold: number };
  timeline: { total: number; onHold: number };
  evidence_map: { total: number };
  questions: { total: number };
  attention: { total: number };
};

export async function buildSharePreview(caseId: string, scopes: Scope[]): Promise<SharePreview> {
  const wants = (s: Scope) => scopes.includes(s);
  const preview: SharePreview = {
    story: { total: 0, onHold: 0 },
    documents: { total: 0, onHold: 0 },
    timeline: { total: 0, onHold: 0 },
    evidence_map: { total: 0 },
    questions: { total: 0 },
    attention: { total: 0 },
  };

  if (wants("story")) {
    const all = await supabase
      .from("story_responses")
      .select("id, private_hold", { count: "exact", head: false })
      .eq("case_id", caseId);
    const rows = all.data ?? [];
    preview.story.total = rows.filter((r) => !r.private_hold).length;
    preview.story.onHold = rows.filter((r) => r.private_hold).length;
  }
  if (wants("documents")) {
    const all = await supabase
      .from("documents")
      .select("id, private_hold")
      .eq("case_id", caseId);
    const rows = all.data ?? [];
    preview.documents.total = rows.filter((r) => !r.private_hold).length;
    preview.documents.onHold = rows.filter((r) => r.private_hold).length;
  }
  if (wants("timeline")) {
    const all = await supabase
      .from("events")
      .select("id, private_hold")
      .eq("case_id", caseId);
    const rows = all.data ?? [];
    preview.timeline.total = rows.filter((r) => !r.private_hold).length;
    preview.timeline.onHold = rows.filter((r) => r.private_hold).length;
  }
  if (wants("evidence_map")) {
    const all = await supabase
      .from("evidence_event_links")
      .select("id", { count: "exact", head: true })
      .eq("case_id", caseId);
    preview.evidence_map.total = all.count ?? 0;
  }
  if (wants("questions")) {
    const all = await supabase
      .from("applicant_questions")
      .select("id", { count: "exact", head: true })
      .eq("case_id", caseId);
    preview.questions.total = all.count ?? 0;
  }
  if (wants("attention")) {
    const all = await supabase
      .from("attention_flags")
      .select("id", { count: "exact", head: true })
      .eq("case_id", caseId);
    preview.attention.total = all.count ?? 0;
  }
  return preview;
}

export type ActivityRow = {
  id: string;
  action: string;
  actor_id: string | null;
  actor_role: string | null;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export async function listActivity(caseId: string): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from("audit_events")
    .select("id, action, actor_id, actor_role, target_type, target_id, metadata, created_at")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ActivityRow[];
}

export async function listDeletionRequests(caseId: string) {
  const { data, error } = await supabase
    .from("deletion_requests")
    .select("id, status, reason, requested_at, scheduled_for, cancelled_at, completed_at")
    .eq("case_id", caseId)
    .order("requested_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function requestDeletion(input: {
  caseId: string;
  userId: string;
  reason?: string;
}) {
  const { data, error } = await supabase
    .from("deletion_requests")
    .insert({
      case_id: input.caseId,
      applicant_id: input.userId,
      reason: input.reason ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  await writeAudit({
    userId: input.userId,
    caseId: input.caseId,
    action: "consent.revoke",
    targetType: "deletion_request",
    targetId: data.id,
    metadata: { kind: "deletion_requested" },
  });
  return data.id;
}

export async function cancelDeletionRequest(input: {
  requestId: string;
  userId: string;
  caseId: string;
}) {
  const { error } = await supabase
    .from("deletion_requests")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", input.requestId);
  if (error) throw error;
  await writeAudit({
    userId: input.userId,
    caseId: input.caseId,
    action: "consent.grant",
    targetType: "deletion_request",
    targetId: input.requestId,
    metadata: { kind: "deletion_cancelled" },
  });
}

export async function exportCaseZip(caseId: string): Promise<Blob> {
  const [{ default: JSZip }] = await Promise.all([import("jszip")]);
  const zip = new JSZip();

  // The case itself keyed by id
  {
    const { data } = await supabase.from("cases").select("*").eq("id", caseId);
    zip.file(`data/cases.json`, JSON.stringify(data ?? [], null, 2));
  }

  const tables = [
    "story_responses",
    "documents",
    "document_versions",
    "events",
    "event_sources",
    "evidence_event_links",
    "extracted_facts",
    "attention_flags",
    "clarification_items",
    "missing_info_items",
    "applicant_questions",
    "consent_records",
    "sharing_grants",
    "audit_events",
  ] as const;

  for (const table of tables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = supabase.from(table).select("*");
    const { data, error } = await q.eq("case_id", caseId);
    if (error) continue;
    zip.file(`data/${table}.json`, JSON.stringify(data ?? [], null, 2));
  }

  // Original files
  const { data: docs } = await supabase
    .from("documents")
    .select("id, reference_code, original_filename, storage_path")
    .eq("case_id", caseId);
  const originals = zip.folder("originals");
  for (const d of docs ?? []) {
    if (!d.storage_path || !originals) continue;
    const dl = await supabase.storage.from("case-documents").download(d.storage_path);
    if (dl.data) {
      const safeName = `${d.reference_code}_${d.original_filename ?? "file"}`.replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );
      originals.file(safeName, dl.data);
    }
  }

  zip.file(
    "README.txt",
    "This archive is a copy of your CaseMap data. Your original uploaded files are in /originals. Structured records are in /data as JSON.\n",
  );

  return await zip.generateAsync({ type: "blob" });
}