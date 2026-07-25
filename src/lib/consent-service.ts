import { supabase } from "@/integrations/supabase/client";
import { writeAudit } from "./audit-service";

export type ConsentType = "ai_processing" | "machine_translation";

// The exact plain-language text a user consents to. Bumping the version means
// the user must re-consent. Keep in sync with the copy shown on /consent.
export const CONSENT_TEXT: Record<ConsentType, { version: string; text: string }> = {
  ai_processing: {
    version: "v1-2026-07-25",
    text:
      "I allow the tool to send my writing and documents to an AI service to " +
      "suggest a timeline, a list of documents, and questions for my lawyer. " +
      "Every suggestion has to be checked by me and by a legal professional " +
      "before it is used.",
  },
  machine_translation: {
    version: "v1-2026-07-25",
    text:
      "I allow the tool to translate my writing and documents by machine. I " +
      "understand machine translation is not the same as certified translation " +
      "and that a lawyer or certified translator will still need to check it " +
      "for anything official.",
  },
};

async function sha256(text: string) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function listActiveConsents(userId: string, caseId: string) {
  const { data, error } = await supabase
    .from("consent_records")
    .select("consent_type, granted, revoked_at, granted_at, consent_text_version")
    .eq("applicant_id", userId)
    .eq("case_id", caseId)
    .order("granted_at", { ascending: false });
  if (error) throw error;
  const map = new Map<ConsentType, boolean>();
  for (const row of data ?? []) {
    const t = row.consent_type as ConsentType;
    if (!map.has(t)) map.set(t, !!row.granted && row.revoked_at === null);
  }
  return map;
}

export async function setConsent(input: {
  userId: string;
  caseId: string;
  type: ConsentType;
  granted: boolean;
}) {
  const spec = CONSENT_TEXT[input.type];
  const textHashSuffix = await sha256(spec.text);
  // Revoke previous active records of the same type so the latest wins.
  const { error: revErr } = await supabase
    .from("consent_records")
    .update({ revoked_at: new Date().toISOString() })
    .eq("applicant_id", input.userId)
    .eq("case_id", input.caseId)
    .eq("consent_type", input.type)
    .is("revoked_at", null);
  if (revErr) throw revErr;

  const { error: insErr } = await supabase.from("consent_records").insert({
    case_id: input.caseId,
    applicant_id: input.userId,
    consent_type: input.type,
    consent_text_version: `${spec.version}#${textHashSuffix.slice(0, 12)}`,
    granted: input.granted,
    user_agent:
      typeof navigator !== "undefined" ? navigator.userAgent : null,
  });
  if (insErr) throw insErr;

  await writeAudit({
    userId: input.userId,
    caseId: input.caseId,
    action: input.granted ? "consent.grant" : "consent.revoke",
    targetType: "consent_type",
    targetId: input.type,
    metadata: {
      consent_type: input.type,
      consent_text_version: `${spec.version}#${textHashSuffix.slice(0, 12)}`,
    },
  });
}

export async function hasActiveConsent(userId: string, type: ConsentType) {
  const { data, error } = await supabase.rpc("has_active_consent", {
    _user_id: userId,
    _consent_type: type,
  });
  if (error) throw error;
  return !!data;
}