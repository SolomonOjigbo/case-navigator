// GATE 2 — nothing leaves this system until a verified professional has
// reviewed the summary.
//
// Three independent layers enforce it, on purpose:
//   1. this function refuses early, with a reason the UI can show
//   2. export_packages.professional_approved_by is NOT NULL in the schema
//   3. the export_packages_gate2 trigger re-checks the review on INSERT
//
// Only a professional can call this. The applicant cannot approve their own
// package — that is the whole point of the gate.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildExclusionManifest,
  buildExportHtml,
  buildWatermarkText,
  type Citation,
  type ExportScope,
} from "./export-document";
import { NOT_ASSESSED_TEXT, type SummaryContent } from "./summary-text";

const InputSchema = z.object({
  caseId: z.string().uuid(),
  summaryOutputId: z.string().uuid(),
});

export const GATE2_BLOCKED_MESSAGE = "This summary needs your review before it can be exported.";
export const GATE2_STALE_MESSAGE =
  "This summary changed after it was reviewed. It needs to be created again and reviewed before it can be exported.";

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const createExportPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { caseId, summaryOutputId } = data;

    // ---- Who is asking -------------------------------------------------
    const { data: pro, error: proErr } = await supabase
      .from("professionals")
      .select("id, display_name, organization_id, active")
      .eq("user_id", userId)
      .maybeSingle();
    if (proErr) throw proErr;
    if (!pro?.active) {
      throw new Error("Only a verified professional can create an export package.");
    }

    // ---- Active grant + scopes ------------------------------------------
    const nowIso = new Date().toISOString();
    const { data: grant, error: grantErr } = await supabase
      .from("sharing_grants")
      .select("id, scopes, expires_at")
      .eq("case_id", caseId)
      .eq("professional_id", pro.id)
      .is("revoked_at", null)
      .gt("expires_at", nowIso)
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (grantErr) throw grantErr;
    if (!grant) throw new Error("You do not currently have access to this case.");
    const scopes = (grant.scopes ?? []) as ExportScope[];

    // ---- GATE 2 (application layer) --------------------------------------
    const { data: summaryRow, error: sumErr } = await supabase
      .from("ai_outputs")
      .select(
        "id, case_id, output_type, content, citation_map, stale, unsupported_sentences_removed",
      )
      .eq("id", summaryOutputId)
      .maybeSingle();
    if (sumErr) throw sumErr;
    if (!summaryRow || summaryRow.case_id !== caseId) throw new Error("Summary not found.");
    if (summaryRow.stale) throw new Error(GATE2_STALE_MESSAGE);

    const { data: reviews, error: revErr } = await supabase
      .from("professional_reviews")
      .select("id, disposition, edited_content")
      .eq("target_type", "ai_output")
      .eq("target_id", summaryOutputId)
      .eq("reviewer_id", pro.id)
      .in("disposition", ["accepted", "edited"])
      .order("reviewed_at", { ascending: false })
      .limit(1);
    if (revErr) throw revErr;
    if ((reviews ?? []).length === 0) throw new Error(GATE2_BLOCKED_MESSAGE);
    // The trigger re-checks all of this on INSERT below.
    // ----------------------------------------------------------------------

    const summary = summaryRow.content as unknown as SummaryContent;

    // ---- Gather, excluding private hold and out-of-scope ------------------
    const wants = (s: ExportScope) => scopes.includes(s);

    const [
      eventsRes,
      heldEventsRes,
      docsRes,
      heldDocsRes,
      linksRes,
      heldStoryRes,
      translationsRes,
    ] = await Promise.all([
      wants("timeline")
        ? supabase
            .from("events")
            .select("id, reference_code, title, date_start, date_certainty, location_name")
            .eq("case_id", caseId)
            .eq("private_hold", false)
            .eq("stale", false)
        : Promise.resolve({ data: [] as never[] }),
      supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("case_id", caseId)
        .eq("private_hold", true),
      wants("documents")
        ? supabase
            .from("documents")
            .select(
              "id, reference_code, original_filename, doc_type, document_date, primary_language, readability, translation_status",
            )
            .eq("case_id", caseId)
            .eq("private_hold", false)
        : Promise.resolve({ data: [] as never[] }),
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("case_id", caseId)
        .eq("private_hold", true),
      wants("evidence_map")
        ? supabase
            .from("evidence_event_links")
            .select("id, event_id, document_id, relationship, explanation")
            .eq("case_id", caseId)
            .eq("stale", false)
        : Promise.resolve({ data: [] as never[] }),
      supabase
        .from("story_responses")
        .select("id", { count: "exact", head: true })
        .eq("case_id", caseId)
        .eq("private_hold", true),
      // Scoped through this case's sources: an unfiltered count would include
      // translations from every other case this professional can reach.
      supabase
        .from("translations")
        .select("id, sources!inner(case_id)")
        .eq("certified", false)
        .eq("sources.case_id", caseId),
    ]);

    const events = (eventsRes.data ?? []) as Array<{
      id: string;
      reference_code: string;
      title: string;
      date_start: string | null;
      date_certainty: string;
      location_name: string | null;
    }>;
    const documents = (docsRes.data ?? []) as Array<{
      id: string;
      reference_code: string;
      original_filename: string | null;
      doc_type: string | null;
      document_date: string | null;
      primary_language: string | null;
      readability: string | null;
      translation_status: string | null;
    }>;
    const eventRefById = new Map(events.map((e) => [e.id, e.reference_code]));
    const docRefByDocId = new Map(documents.map((d) => [d.id, d.reference_code]));

    const links = (
      (linksRes.data ?? []) as Array<{
        event_id: string;
        document_id: string;
        relationship: string;
        explanation: string;
      }>
    )
      // A link whose event or document was withheld must not appear at all —
      // naming it would leak the existence of a held item.
      .filter((l) => eventRefById.has(l.event_id) && docRefByDocId.has(l.document_id))
      .map((l) => ({
        event_reference: eventRefById.get(l.event_id)!,
        document_reference: docRefByDocId.get(l.document_id)!,
        relationship: l.relationship,
        explanation: l.explanation,
      }));

    // ---- Source appendix -------------------------------------------------
    const citationMap = (summaryRow.citation_map ?? {}) as Record<string, string[]>;
    const citedSourceIds = Array.from(new Set(Object.values(citationMap).flat()));
    const citations: Citation[] = [];
    if (citedSourceIds.length > 0) {
      const { data: srcRows } = await supabase
        .from("sources")
        .select("id, source_type, reference_id, reference_code")
        .in("id", citedSourceIds);
      const ocrIds = (srcRows ?? [])
        .filter((s) => s.source_type === "document")
        .map((s) => s.reference_id);
      const ocrById = new Map<
        string,
        { document_version_id: string; page_number: number | null }
      >();
      if (ocrIds.length > 0) {
        const { data: ocr } = await supabase
          .from("ocr_outputs")
          .select("id, document_version_id, page_number")
          .in("id", ocrIds);
        for (const r of ocr ?? []) ocrById.set(r.id as string, r as never);
      }
      const dvById = new Map<string, string>();
      const dvIds = Array.from(
        new Set(Array.from(ocrById.values()).map((o) => o.document_version_id)),
      );
      if (dvIds.length > 0) {
        const { data: dv } = await supabase
          .from("document_versions")
          .select("id, document_id")
          .in("id", dvIds);
        for (const r of dv ?? []) dvById.set(r.id as string, r.document_id as string);
      }
      const storyIds = (srcRows ?? [])
        .filter((s) => s.source_type === "story_response")
        .map((s) => s.reference_id);
      const storyById = new Map<string, string>();
      if (storyIds.length > 0) {
        const { data: st } = await supabase
          .from("story_responses")
          .select("id, section_key")
          .in("id", storyIds);
        for (const r of st ?? []) storyById.set(r.id as string, r.section_key as string);
      }

      for (const [key, ids] of Object.entries(citationMap)) {
        for (const sid of ids) {
          const src = (srcRows ?? []).find((s) => s.id === sid);
          if (!src) continue;
          if (src.source_type === "document") {
            const ocr = ocrById.get(src.reference_id);
            const docId = ocr ? dvById.get(ocr.document_version_id) : null;
            const ref = docId ? (docRefByDocId.get(docId) ?? null) : null;
            // Citation pointing at a withheld or out-of-scope document: omit.
            if (!ref) continue;
            citations.push({
              key,
              source_id: sid,
              document_reference: ref,
              page_number: ocr?.page_number ?? null,
              story_section: null,
              excerpt: null,
            });
          } else if (src.source_type === "story_response") {
            if (!wants("story")) continue;
            citations.push({
              key,
              source_id: sid,
              document_reference: null,
              page_number: null,
              story_section: storyById.get(src.reference_id) ?? null,
              excerpt: null,
            });
          }
        }
      }
    }

    // ---- Counts for the cover page --------------------------------------
    const { count: aiFindingCount } = await supabase
      .from("evidence_event_links")
      .select("id", { count: "exact", head: true })
      .eq("case_id", caseId)
      .eq("created_by", "ai");
    const { count: reviewedFindingCount } = await supabase
      .from("professional_reviews")
      .select("id", { count: "exact", head: true })
      .eq("case_id", caseId)
      .in("disposition", ["accepted", "edited"]);

    const exclusions = buildExclusionManifest({
      privateHold: {
        timeline: heldEventsRes.count ?? 0,
        documents: heldDocsRes.count ?? 0,
        story: heldStoryRes.count ?? 0,
      },
      outOfScope: {
        timeline: wants("timeline") ? 0 : 1,
        documents: wants("documents") ? 0 : 1,
        evidence_map: wants("evidence_map") ? 0 : 1,
        story: wants("story") ? 0 : 1,
      },
      // Machine translations stay out of the body and are only ever labelled
      // "Working translation — not certified" where they do appear.
      uncertifiedTranslations: (translationsRes.data ?? []).length,
    });

    const generatedAt = new Date().toISOString();
    const { data: caseRow } = await supabase
      .from("cases")
      .select("reference_code")
      .eq("id", caseId)
      .maybeSingle();
    const caseReference = caseRow?.reference_code ?? caseId.slice(0, 8);
    const recipientName = pro.display_name ?? "Reviewing professional";

    const html = buildExportHtml({
      caseReference,
      recipientName,
      generatedAt,
      scopes,
      summary: {
        mode: (summary?.mode ?? "professional_summary") as SummaryContent["mode"],
        sections: summary?.sections ?? [],
        not_assessed: NOT_ASSESSED_TEXT,
      },
      events,
      documents,
      links,
      citations,
      exclusions,
      aiFindingCount: aiFindingCount ?? 0,
      reviewedFindingCount: reviewedFindingCount ?? 0,
    });

    const sha256 = await sha256Hex(html);
    const storagePath = `${caseId}/exports/${summaryOutputId}-${Date.now()}.html`;
    const { error: upErr } = await supabase.storage
      .from("case-documents")
      .upload(storagePath, new Blob([html], { type: "text/html" }), {
        contentType: "text/html",
        upsert: false,
      });
    if (upErr) throw upErr;

    const watermark = buildWatermarkText({ recipientName, caseReference, generatedAt });
    const { data: pkg, error: pkgErr } = await supabase
      .from("export_packages")
      .insert({
        case_id: caseId,
        created_by: userId,
        recipient_id: pro.id,
        format: "html",
        scopes,
        storage_path: storagePath,
        sha256,
        watermark_text: watermark,
        exclusion_manifest: exclusions as never,
        summary_output_id: summaryOutputId,
        professional_approved_by: pro.id,
        expires_at: grant.expires_at,
      })
      .select("id")
      .single();
    if (pkgErr) throw pkgErr;

    await supabase.from("audit_events").insert({
      case_id: caseId,
      actor_id: userId,
      actor_role: "professional",
      action: "export.created",
      target_type: "export_package",
      target_id: pkg.id,
      metadata: { scopes, sha256, summary_output_id: summaryOutputId } as never,
    });

    return { ok: true as const, exportId: pkg.id, storagePath, sha256 };
  });

const DownloadSchema = z.object({ exportId: z.string().uuid() });

export const recordExportDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DownloadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: pkg, error } = await supabase
      .from("export_packages")
      .select("id, case_id, storage_path")
      .eq("id", data.exportId)
      .maybeSingle();
    if (error) throw error;
    if (!pkg) throw new Error("Export not found.");

    await supabase.from("audit_events").insert({
      case_id: pkg.case_id,
      actor_id: userId,
      actor_role: "professional",
      action: "export.downloaded",
      target_type: "export_package",
      target_id: pkg.id,
      metadata: {} as never,
    });

    const { data: signed, error: signErr } = await supabase.storage
      .from("case-documents")
      .createSignedUrl(pkg.storage_path, 300);
    if (signErr) throw signErr;
    return { ok: true as const, url: signed.signedUrl };
  });
