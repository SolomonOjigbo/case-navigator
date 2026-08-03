import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Camera, FileText, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AIGeneratedBanner } from "@/components/primitives/AIGeneratedBanner";
import { useSession } from "@/hooks/use-session";
import { getOrCreateOwnCase } from "@/lib/case-service";
import {
  ACCEPTED_MIME,
  MAX_BYTES,
  listDocumentsForCase,
  uploadDocument,
  type DocRow,
} from "@/lib/documents-service";
import { processDocument } from "@/lib/documents.functions";

type Progress = { id: string; name: string; loaded: number; total: number; state: "uploading" | "processing" | "done" | "error"; message?: string };

function View() {
  const { t } = useTranslation();
  const { user } = useSession();
  const qc = useQueryClient();
  const [progress, setProgress] = useState<Progress[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const caseQ = useQuery({
    queryKey: ["own-case", user?.id],
    enabled: !!user?.id,
    queryFn: () => getOrCreateOwnCase(user!.id),
  });
  const caseId = caseQ.data?.id ?? null;

  const docsQ = useQuery({
    queryKey: ["documents", caseId],
    enabled: !!caseId,
    queryFn: () => listDocumentsForCase(caseId!),
  });

  const updateProgress = useCallback((id: string, patch: Partial<Progress>) => {
    setProgress((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!caseId || !user?.id) return;
      const arr = Array.from(files);
      for (const file of arr) {
        const localId = crypto.randomUUID();
        setProgress((prev) => [
          ...prev,
          { id: localId, name: file.name, loaded: 0, total: file.size, state: "uploading" },
        ]);
        if (file.size > MAX_BYTES) {
          updateProgress(localId, { state: "error", message: t("documents.errors.too_large") });
          continue;
        }
        try {
          const { document, documentVersionId } = await uploadDocument({
            caseId,
            userId: user.id,
            file,
            onProgress: (loaded, total) => updateProgress(localId, { loaded, total }),
          });
          updateProgress(localId, { state: "processing", loaded: file.size });
          try {
            await processDocument({
              data: { caseId, documentId: document.id, documentVersionId },
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            updateProgress(localId, { state: "error", message: msg });
            continue;
          }
          updateProgress(localId, { state: "done" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          updateProgress(localId, { state: "error", message: msg });
        }
      }
      qc.invalidateQueries({ queryKey: ["documents", caseId] });
    },
    [caseId, user?.id, qc, t, updateProgress],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="reading-column py-2 sm:py-4">
      <h1 className="text-page-title text-foreground">
        {t("documents.title")}
      </h1>
      <p className="mt-2 text-[15px] text-muted-foreground">{t("documents.intro")}</p>

      <div
        role="note"
        className="mt-4 rounded-md border-l-4 border-l-primary bg-surface-raised p-3 text-sm text-foreground"
      >
        {t("documents.immutability_notice")}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`mt-6 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border bg-surface-raised"
        }`}
      >
        <Upload aria-hidden className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-base text-foreground">{t("documents.dropzone.title")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("documents.dropzone.hint")}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            size="lg"
            onClick={() => fileInput.current?.click()}
            className="min-h-11"
          >
            {t("documents.dropzone.choose_files")}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="secondary"
            onClick={() => cameraInput.current?.click()}
            className="min-h-11"
          >
            <Camera aria-hidden className="me-2 h-4 w-4" />
            {t("documents.dropzone.use_camera")}
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPTED_MIME}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {progress.length > 0 && (
        <div className="mt-6 space-y-3">
          {progress.map((p) => {
            const pct = p.total > 0 ? Math.min(100, Math.round((p.loaded / p.total) * 100)) : 0;
            return (
              <Card key={p.id} className="p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="text-muted-foreground">
                    {p.state === "uploading" && `${pct}%`}
                    {p.state === "processing" && t("documents.progress.processing")}
                    {p.state === "done" && t("documents.progress.done")}
                    {p.state === "error" && t("documents.progress.error")}
                  </span>
                </div>
                <Progress value={p.state === "done" ? 100 : pct} className="mt-2 h-2" />
                {p.message && (
                  <p className="mt-1 text-xs text-attention-foreground">{p.message}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="mt-10 text-xl font-semibold text-foreground">
        {t("documents.inventory.title")}
      </h2>
      <div className="mt-2">
        <AIGeneratedBanner />
      </div>

      {docsQ.isLoading && (
        <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
      )}

      {docsQ.data && docsQ.data.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">{t("documents.inventory.empty")}</p>
      )}

      {docsQ.data && docsQ.data.length > 0 && (
        <>
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pe-3">{t("documents.cols.ref")}</th>
                  <th className="py-2 pe-3">{t("documents.cols.name")}</th>
                  <th className="py-2 pe-3">{t("documents.cols.appears_to_be")}</th>
                  <th className="py-2 pe-3">{t("documents.cols.date")}</th>
                  <th className="py-2 pe-3">{t("documents.cols.language")}</th>
                  <th className="py-2 pe-3">{t("documents.cols.readability")}</th>
                  <th className="py-2 pe-3">{t("documents.cols.translation")}</th>
                  <th className="py-2 pe-3">{t("documents.cols.events")}</th>
                  <th className="py-2 pe-3">{t("documents.cols.status")}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {docsQ.data.map((d) => (
                  <DocRowLine key={d.id} d={d} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-3 md:hidden">
            {docsQ.data.map((d) => (
              <DocCard key={d.id} d={d} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function statusKey(s: string) {
  return `documents.status.${s}`;
}
function readabilityKey(r: string | null) {
  return r ? `documents.readability.${r}` : "documents.readability.unknown";
}

function DocRowLine({ d }: { d: DocRow & { connected_events: number } }) {
  const { t } = useTranslation();
  return (
    <tr className="border-t border-border">
      <td className="py-2 pe-3 font-mono text-xs">{d.reference_code}</td>
      <td className="py-2 pe-3">{d.original_filename}</td>
      <td className="py-2 pe-3">{d.doc_type ?? t("documents.unknown")}</td>
      <td className="py-2 pe-3">{d.document_date ?? "—"}</td>
      <td className="py-2 pe-3">{d.primary_language ?? "—"}</td>
      <td className="py-2 pe-3">{t(readabilityKey(d.readability))}</td>
      <td className="py-2 pe-3">{t(`documents.translation.${d.translation_status}`)}</td>
      <td className="py-2 pe-3">{d.connected_events}</td>
      <td className="py-2 pe-3">{t(statusKey(d.processing_status))}</td>
      <td className="py-2">
        <Link
          to="/app/documents/$documentId"
          params={{ documentId: d.id }}
          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
        >
          {t("documents.open")} <ArrowRight aria-hidden className="h-3 w-3" />
        </Link>
      </td>
    </tr>
  );
}

function DocCard({ d }: { d: DocRow & { connected_events: number } }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <FileText aria-hidden className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{d.original_filename}</p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {d.reference_code}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-foreground/90">
            <dt className="text-muted-foreground">{t("documents.cols.appears_to_be")}</dt>
            <dd>{d.doc_type ?? t("documents.unknown")}</dd>
            <dt className="text-muted-foreground">{t("documents.cols.date")}</dt>
            <dd>{d.document_date ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("documents.cols.language")}</dt>
            <dd>{d.primary_language ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("documents.cols.readability")}</dt>
            <dd>{t(readabilityKey(d.readability))}</dd>
            <dt className="text-muted-foreground">{t("documents.cols.events")}</dt>
            <dd>{d.connected_events}</dd>
            <dt className="text-muted-foreground">{t("documents.cols.status")}</dt>
            <dd>{t(statusKey(d.processing_status))}</dd>
          </dl>
          <div className="mt-3">
            <Link
              to="/app/documents/$documentId"
              params={{ documentId: d.id }}
              className="text-sm text-primary underline-offset-2 hover:underline"
            >
              {t("documents.open")}
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

export const Route = createFileRoute("/app/documents")({
  component: View,
  head: () => ({
    meta: [
      { title: "Your documents · CaseMap" },
      {
        name: "description",
        content:
          "Upload and organize the documents for your case. Originals are kept unchanged; only notes and copies are added alongside them.",
      },
      { property: "og:title", content: "Your documents · CaseMap" },
      {
        property: "og:description",
        content:
          "Upload and organize the documents for your case. Originals are kept unchanged.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

