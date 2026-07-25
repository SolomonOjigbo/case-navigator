import { supabase } from "@/integrations/supabase/client";
import { getOrCreateOwnCase } from "./case-service";

export type AuditAction =
  | "auth.signup"
  | "auth.login"
  | "consent.grant"
  | "consent.revoke";

type Metadata = Record<string, unknown>;

/**
 * Append an audit_events row. audit_events is append-only (see RLS) and
 * scoped to a case_id, so we resolve the user's own case first. Failures
 * are swallowed and logged — auditing must never block the user action.
 */
export async function writeAudit(input: {
  userId: string;
  action: AuditAction;
  caseId?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Metadata;
}) {
  try {
    const caseId = input.caseId ?? (await getOrCreateOwnCase(input.userId)).id;
    const metadata: Metadata = {
      ...(input.metadata ?? {}),
      user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent : null,
    };
    const { error } = await supabase.from("audit_events").insert({
      case_id: caseId,
      actor_id: input.userId,
      actor_role: "applicant",
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      metadata: metadata as never,
    });
    if (error) throw error;
  } catch (err) {
    console.warn("[audit] failed to write", input.action, err);
  }
}
