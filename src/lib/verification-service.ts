// Professional verification (S4-1).
//
// Listing someone as a lawyer is a representation. Everything the product
// promises an applicant — that a booking is with a real professional, that
// sharing a case sends it to someone accountable — rests on `verified_at`,
// and until this sprint that column was writable by the professional whose
// row it was.
//
// So nothing here can grant verification. A submission is a request; the
// decision goes through `decide_professional_verification`, a SECURITY
// DEFINER function that refuses anyone without the platform_admin role, and
// the privileged columns on `professionals` are held shut by a trigger. If
// this file were compromised entirely, the worst it could do is submit.
import { supabase } from "@/integrations/supabase/client";

export type VerificationStatus = "pending" | "approved" | "rejected" | "withdrawn";

export type VerificationRow = {
  id: string;
  professional_id: string;
  submitted_by: string;
  license_number: string;
  license_jurisdiction: string;
  display_name: string;
  organization_name: string | null;
  evidence_path: string | null;
  evidence_filename: string | null;
  note: string | null;
  status: VerificationStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

/** What the professional themselves is allowed to change. */
export type SelfEditableProfile = {
  display_name: string | null;
  languages: string[];
  consultation_blurb: string | null;
};

export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const EVIDENCE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";

const EVIDENCE_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

/** Storage rejects most punctuation in object names; keep it boring. */
function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "evidence";
}

// -------------------------------------------------------------------------
// The professional's side
// -------------------------------------------------------------------------

export async function listMyVerifications(professionalId: string): Promise<VerificationRow[]> {
  const { data, error } = await supabase
    .from("professional_verifications")
    .select("*")
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as VerificationRow[];
}

export async function uploadEvidence(input: {
  professionalId: string;
  file: File;
}): Promise<{ path: string; filename: string }> {
  if (input.file.size > EVIDENCE_MAX_BYTES) throw new Error("evidence_too_large");
  const mime = input.file.type || "application/octet-stream";
  if (!EVIDENCE_MIME.has(mime)) throw new Error("evidence_wrong_type");

  // The bucket's INSERT policy keys off the first path segment, so the
  // professional id is not decoration — it is the access check.
  const path = `${input.professionalId}/${crypto.randomUUID()}-${safeFilename(input.file.name)}`;
  const { error } = await supabase.storage
    .from("professional-evidence")
    .upload(path, input.file, { contentType: mime, upsert: false });
  if (error) throw error;
  return { path, filename: input.file.name };
}

export async function submitVerification(input: {
  professionalId: string;
  submittedBy: string;
  licenseNumber: string;
  jurisdiction: string;
  displayName: string;
  organizationName: string;
  note: string;
  evidence: { path: string; filename: string } | null;
}): Promise<VerificationRow> {
  const { data, error } = await supabase
    .from("professional_verifications")
    .insert({
      professional_id: input.professionalId,
      submitted_by: input.submittedBy,
      license_number: input.licenseNumber.trim(),
      license_jurisdiction: input.jurisdiction,
      display_name: input.displayName.trim(),
      organization_name: input.organizationName.trim() || null,
      note: input.note.trim() || null,
      evidence_path: input.evidence?.path ?? null,
      evidence_filename: input.evidence?.filename ?? null,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    // professional_verifications_one_open
    if (/duplicate key|unique/i.test(error.message)) throw new Error("already_pending");
    throw error;
  }
  return data as VerificationRow;
}

export async function withdrawVerification(verificationId: string) {
  const { error } = await supabase
    .from("professional_verifications")
    .update({ status: "withdrawn" })
    .eq("id", verificationId);
  if (error) throw error;
}

// -------------------------------------------------------------------------
// The admin's side
// -------------------------------------------------------------------------

export async function listVerificationQueue(
  status: VerificationStatus,
): Promise<VerificationRow[]> {
  // RLS returns nothing to a non-admin rather than erroring, so a non-admin
  // sees an empty queue, not a broken page.
  const { data, error } = await supabase
    .from("professional_verifications")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as VerificationRow[];
}

/**
 * A time-limited link to the submitted evidence. Signed rather than public:
 * the bucket is private and a practising certificate carries a real name and
 * often an address.
 */
export async function evidenceUrl(path: string, expiresInSeconds = 300): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("professional-evidence")
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function decideVerification(input: {
  verificationId: string;
  approve: boolean;
  note: string;
}) {
  const { error } = await supabase.rpc("decide_professional_verification", {
    p_verification_id: input.verificationId,
    p_approve: input.approve,
    p_note: input.note.trim() || undefined,
  });
  if (error) throw error;
}

export async function revokeVerification(input: { professionalId: string; note: string }) {
  const { error } = await supabase.rpc("revoke_professional_verification", {
    p_professional_id: input.professionalId,
    p_note: input.note.trim() || undefined,
  });
  if (error) throw error;
}

/** Everyone currently listable, for the admin's revoke list. */
export async function listVerifiedProfessionals() {
  const { data, error } = await supabase
    .from("professionals")
    .select("id, display_name, license_number, license_jurisdiction, verified_at, active")
    .not("verified_at", "is", null)
    .order("display_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
