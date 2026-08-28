// Carrying out deletion requests.
//
// This is the only code in the product that destroys someone's material on
// purpose and without asking again, so it is written to be timid.
//
// The order is the whole design. Files first, database second:
//
//   1. Enumerate every object in the bucket under `<case_id>/`. Not the paths
//      named in the database — the bucket itself. An upload writes the file
//      first and the row second, so a failed insert leaves a file that no row
//      names, and a path-based sweep would walk straight past it.
//   2. Delete the files. If any file fails to delete, STOP. The row is marked
//      failed with the reason and the case is left intact. Half-deleting is
//      the one outcome worse than not deleting: telling someone their
//      documents are gone while they sit in a bucket is a lie, and a person
//      may have made a safety decision on the strength of it.
//   3. Delete the case row. Twenty-odd tables cascade off it.
//   4. Mark the request completed. That row survives — case_id is SET NULL —
//      so there is still proof this happened after its subject is gone.
//
// Deliberately NOT deleted: the person's account and anything they wrote in
// the community. The screen that files this request says "delete your case",
// the community was built to be separate from the case, and someone who asked
// to remove their claim has not asked to be erased from conversations where
// other people are mid-reply. Account deletion is a different request and
// should be built as one.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * The service-role client, loaded on demand — this file is a `.functions.ts`
 * and so is reachable from the client bundle.
 */
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const DOCUMENT_BUCKET = "case-documents";

/**
 * How many cases one run will delete.
 *
 * Not a performance limit — a blast radius. If a bug or a bad migration ever
 * makes every request look due, this run destroys twenty-five cases and the
 * next scheduled run is a day away, which is enough time to notice. Without a
 * cap the same bug empties the database in one pass.
 */
export const MAX_DELETIONS_PER_RUN = 25;

export type DeletionOutcome = {
  requestId: string;
  caseId: string;
  status: "completed" | "failed" | "skipped";
  filesDeleted?: number;
  reason?: string;
};

export type DeletionSweep = {
  due: number;
  completed: number;
  failed: number;
  skipped: number;
  dryRun: boolean;
  outcomes: DeletionOutcome[];
};

/**
 * Every stored object belonging to a case.
 *
 * Walks the bucket under `<case_id>/` rather than reading paths out of
 * `documents`, `document_versions` and `export_packages`. Both would work for
 * a tidy case; only this one works for an untidy one.
 *
 * An upload is two steps — put the file in the bucket, then write the row that
 * names it — and the second can fail. It did while this job was being tested:
 * two files went into the bucket, the insert was rejected by a check
 * constraint, and a path-based sweep found nothing to delete, reported success
 * and left both files behind. Someone would have been told their documents
 * were gone while they sat there.
 *
 * The prefix is trustworthy because the bucket's own INSERT policy enforces
 * it: `(storage.foldername(name))[1]` must be a case the uploader owns. Nothing
 * belonging to this case can be stored anywhere else, and nothing under this
 * prefix belongs to anyone else.
 */
async function listCaseObjects(caseId: string): Promise<string[]> {
  const db = await admin();
  const found: string[] = [];

  // list() returns one level at a time, with folders indistinguishable from
  // files except that a folder has no `id`. Walk breadth-first, with a hard
  // cap: a runaway walk on a bucket this job is about to empty would be a bad
  // way to find out about a cycle.
  const queue = [caseId];
  let visited = 0;

  while (queue.length > 0 && visited < 500) {
    const prefix = queue.shift()!;
    visited += 1;

    const { data, error } = await db.storage.from(DOCUMENT_BUCKET).list(prefix, { limit: 1000 });

    // A failure to enumerate must not be read as "there is nothing here".
    if (error) throw new Error(`listing ${prefix}: ${error.message}`);

    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) found.push(path);
      else queue.push(path);
    }
  }

  return found;
}

/**
 * Delete one case, files first.
 *
 * Never throws — a single bad request must not stop the sweep from processing
 * the rest. Every failure ends up on the row instead.
 */
async function deleteOne(
  request: { id: string; case_id: string; applicant_id: string },
  dryRun: boolean,
): Promise<DeletionOutcome> {
  const db = await admin();
  const { id: requestId, case_id: caseId, applicant_id: applicantId } = request;

  try {
    // The case may already be gone — a second run, or a manual deletion.
    // Close the request rather than failing it.
    const { data: kase } = await db
      .from("cases")
      .select("id, applicant_id")
      .eq("id", caseId)
      .maybeSingle();

    if (!kase) {
      if (!dryRun) {
        await db
          .from("deletion_requests")
          .update({ status: "completed", completed_at: new Date().toISOString(), files_deleted: 0 })
          .eq("id", requestId);
      }
      return {
        requestId,
        caseId,
        status: "completed",
        filesDeleted: 0,
        reason: "case already gone",
      };
    }

    // Defensive: the request and the case must agree about whose they are.
    // A mismatch means something is wrong upstream and this is not the moment
    // to guess.
    if (kase.applicant_id !== applicantId) {
      if (!dryRun) {
        await db
          .from("deletion_requests")
          .update({ status: "failed", error: "request and case disagree about the owner" })
          .eq("id", requestId);
      }
      return { requestId, caseId, status: "failed", reason: "owner mismatch" };
    }

    const paths = await listCaseObjects(caseId);

    if (dryRun) {
      return {
        requestId,
        caseId,
        status: "skipped",
        filesDeleted: paths.length,
        reason: "dry run",
      };
    }

    // Files first. Storage removal is not transactional with the database, so
    // this is the step that can leave things inconsistent — do it while the
    // rows that name the files still exist, so a failure is recoverable.
    if (paths.length > 0) {
      const { error: storageErr } = await db.storage.from(DOCUMENT_BUCKET).remove(paths);
      if (storageErr) {
        await db
          .from("deletion_requests")
          .update({
            status: "failed",
            error: `storage: ${storageErr.message}`.slice(0, 800),
          })
          .eq("id", requestId);
        return { requestId, caseId, status: "failed", reason: `storage: ${storageErr.message}` };
      }
    }

    // Then the case. Everything case-scoped cascades from here.
    const { error: caseErr } = await db.from("cases").delete().eq("id", caseId);
    if (caseErr) {
      await db
        .from("deletion_requests")
        .update({
          status: "failed",
          error: `database: ${caseErr.message}. Files were already removed.`.slice(0, 800),
        })
        .eq("id", requestId);
      return { requestId, caseId, status: "failed", reason: `database: ${caseErr.message}` };
    }

    // The request row survived the cascade with case_id set to null. Close it.
    await db
      .from("deletion_requests")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        files_deleted: paths.length,
      })
      .eq("id", requestId);

    return { requestId, caseId, status: "completed", filesDeleted: paths.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    try {
      if (!dryRun) {
        await (
          await admin()
        )
          .from("deletion_requests")
          .update({ status: "failed", error: message.slice(0, 800) })
          .eq("id", requestId);
      }
    } catch {
      // If we cannot even record the failure, the sweep result is the only
      // place it will be seen. Better that than a thrown error taking the
      // remaining requests with it.
    }
    return { requestId, caseId, status: "failed", reason: message };
  }
}

/**
 * Every request whose thirty days are up.
 *
 * `dryRun` reports what would happen and changes nothing — the way to check
 * this against real data without betting someone's case on it.
 */
export async function runDueDeletions(dryRun = false): Promise<DeletionSweep> {
  const db = await admin();

  const { data: due, error } = await db
    .from("deletion_requests")
    .select("id, case_id, applicant_id, scheduled_for")
    .eq("status", "requested")
    .is("cancelled_at", null)
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(MAX_DELETIONS_PER_RUN);

  if (error) throw error;

  const rows = (due ?? []).filter(
    (r): r is { id: string; case_id: string; applicant_id: string; scheduled_for: string } =>
      !!r.case_id && !!r.applicant_id,
  );

  const outcomes: DeletionOutcome[] = [];
  for (const row of rows) {
    outcomes.push(await deleteOne(row, dryRun));
  }

  return {
    due: rows.length,
    completed: outcomes.filter((o) => o.status === "completed").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    dryRun,
    outcomes,
  };
}

/**
 * Run the sweep by hand. Platform admins only — the check is in the handler
 * rather than in RLS because the work runs as the service role, which has no
 * policies to answer to.
 */
export const runDeletionsNow = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ dryRun: z.boolean().optional() }).parse(d))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token) return { ok: false as const, reason: "not signed in" };

    const db = await admin();
    const { data: userData } = await db.auth.getUser(token);
    const userId = userData?.user?.id;
    if (!userId) return { ok: false as const, reason: "not signed in" };

    const { data: isAdmin } = await db.rpc("has_role", {
      _user_id: userId,
      _role: "platform_admin",
    });
    if (!isAdmin) return { ok: false as const, reason: "platform admins only" };

    return { ok: true as const, result: await runDueDeletions(data.dryRun ?? false) };
  });
