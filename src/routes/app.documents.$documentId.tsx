import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AIGeneratedBanner } from "@/components/primitives/AIGeneratedBanner";
import { useSession } from "@/hooks/use-session";
import {
  createDocSignedUrl,
  getDocument,
  getLatestVersion,
  listOcrForVersion,
  saveDocumentCorrection,
  saveOcrCorrection,
  type CorrectableField,
  type DocRow,
  type OcrRow,
} from "@/lib/documents-service";

function View() {
  const { t } = useTranslation();
  const { user } = useSession();
  const { documentId } = Route.useParams();
  const qc = useQueryClient();

  const docQ = useQuery({
    queryKey: ["document", documentId],
    queryFn: async () => await getDocument(documentId),
  });
  const versionQ = useQuery({
    queryKey: ["document-version", documentId],
    queryFn: () => getLatestVersion(documentId),
    enabled: !!docQ.data,
  });
  const ocrQ = useQuery({
    queryKey: ["ocr", versionQ.data?.id],
    queryFn: () => listOcrForVersion(versionQ.data!.id),
    enabled: !!versionQ.data?.id,
  });
  const urlQ = useQuery({
    queryKey: ["signed-url", docQ.data?.storage_path],
    queryFn: () => createDocSignedUrl(docQ.data!.storage_path),
    enabled: !!docQ.data?.storage_path,
    staleTime: 30 * 60 * 1000,
  });

  const doc = docQ.data;
  if (docQ.isLoading) return <p className="p-6 text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (!doc) return <p className="p-6 text-sm">{t("documents.detail.not_found")}</p>;

  return (
    <div className="reading-column py-2 sm:py-4">
      <Link
        to="/app/documents"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {t("documents.detail.back")}
      </Link>

      <h1 className="mt-3 text-page-title text-foreground">
        {doc.original_filename}
      </h1>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{doc.reference_code}</p>

      <div
        role="note"
        className="mt-4 rounded-md border-l-4 border-l-primary bg-surface-raised p-3 text-sm"
      >
        {t("documents.detail.immutability")}
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-3">
          <h2 className="text-sm font-semibold text-foreground">{t("documents.detail.preview")}</h2>
          <div className="mt-2 h-[520px] w-full overflow-hidden rounded-md border bg-background">
            {urlQ.data ? (
              doc.mime_type === "application/pdf" ? (
                <iframe
                  title={t("documents.detail.preview")}
                  src={urlQ.data}
                  className="h-full w-full"
                />
              ) : doc.mime_type.startsWith("image/") ? (
                <img
                  src={urlQ.data}
                  alt={t("documents.detail.original_alt", { name: doc.original_filename })}
                  className="mx-auto h-full object-contain"
                />
              ) : doc.mime_type.startsWith("audio/") ? (
                <div className="p-4">
                  <audio controls src={urlQ.data} className="w-full" />
                </div>
              ) : (
                <div className="p-4 text-sm">
                  <a href={urlQ.data} target="_blank" rel="noreferrer" className="text-primary underline">
                    {t("documents.detail.download")}
                  </a>
                </div>
              )
            ) : (
              <p className="p-4 text-sm text-muted-foreground">{t("common.loading")}</p>
            )}
          </div>
          <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
            SHA-256: {doc.sha256}
          </p>
          <p className="text-xs text-muted-foreground">{t("documents.detail.hash_caption")}</p>
        </Card>

        <Card className="p-3">
          <h2 className="text-sm font-semibold text-foreground">
            {t("documents.detail.ocr_title")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("documents.detail.ocr_caption")}
          </p>
          <AIGeneratedBanner />
          {doc.readability === "poor" || doc.readability === "unreadable" ? (
            <p className="mt-3 rounded-md border-l-4 border-l-attention bg-attention/10 p-3 text-sm">
              {t("documents.detail.poor_readability")}
            </p>
          ) : null}
          <OcrPanels ocr={ocrQ.data ?? []} caseId={doc.case_id} userId={user?.id ?? ""} />
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">
          {t("documents.detail.corrections_title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("documents.detail.corrections_intro")}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <CorrectionField
            doc={doc}
            field="doc_type"
            label={t("documents.fields.doc_type")}
            userId={user?.id ?? ""}
            onSaved={() => qc.invalidateQueries({ queryKey: ["document", documentId] })}
          />
          <CorrectionField
            doc={doc}
            field="document_date"
            label={t("documents.fields.document_date")}
            userId={user?.id ?? ""}
            placeholder="YYYY-MM-DD"
            onSaved={() => qc.invalidateQueries({ queryKey: ["document", documentId] })}
          />
          <CorrectionField
            doc={doc}
            field="issuer_stated_on_document"
            label={t("documents.fields.issuer")}
            userId={user?.id ?? ""}
            onSaved={() => qc.invalidateQueries({ queryKey: ["document", documentId] })}
          />
          <CorrectionField
            doc={doc}
            field="declared_origin"
            label={t("documents.fields.declared_origin")}
            userId={user?.id ?? ""}
            onSaved={() => qc.invalidateQueries({ queryKey: ["document", documentId] })}
          />
        </div>
      </section>
    </div>
  );
}

function CorrectionField({
  doc,
  field,
  label,
  placeholder,
  userId,
  onSaved,
}: {
  doc: DocRow;
  field: CorrectableField;
  label: string;
  placeholder?: string;
  userId: string;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [val, setVal] = useState<string>(
    ((doc as unknown as Record<string, string | null>)[field] ?? "") as string,
  );
  useEffect(() => {
    setVal(((doc as unknown as Record<string, string | null>)[field] ?? "") as string);
  }, [doc, field]);

  const mut = useMutation({
    mutationFn: () =>
      saveDocumentCorrection({
        caseId: doc.case_id,
        userId,
        document: doc,
        field,
        value: val.trim() ? val.trim() : null,
      }),
    onSuccess: () => {
      toast.success(t("documents.detail.saved"));
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div>
      <Label htmlFor={`corr-${field}`}>{label}</Label>
      <Input
        id={`corr-${field}`}
        value={val}
        placeholder={placeholder}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          const current = ((doc as unknown as Record<string, string | null>)[field] ?? "") as string;
          if (val.trim() !== current) mut.mutate();
        }}
        className="mt-1"
      />
    </div>
  );
}

function OcrPanels({
  ocr,
  caseId,
  userId,
}: {
  ocr: OcrRow[];
  caseId: string;
  userId: string;
}) {
  const { t } = useTranslation();
  if (ocr.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        {t("documents.detail.no_ocr")}
      </p>
    );
  }
  return (
    <div className="mt-3 space-y-4">
      {ocr.map((row) => (
        <OcrRowEditor key={row.id} row={row} caseId={caseId} userId={userId} />
      ))}
    </div>
  );
}

function OcrRowEditor({
  row,
  caseId,
  userId,
}: {
  row: OcrRow;
  caseId: string;
  userId: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(row.user_corrected_text ?? row.text ?? "");
  useEffect(() => {
    setText(row.user_corrected_text ?? row.text ?? "");
  }, [row.id, row.user_corrected_text, row.text]);
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: () =>
      saveOcrCorrection({ caseId, userId, ocr: row, correctedText: text }),
    onSuccess: () => {
      toast.success(t("documents.detail.saved"));
      qc.invalidateQueries({ queryKey: ["ocr", row.document_version_id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div>
      <p className="text-xs text-muted-foreground">
        {t("documents.detail.page", { n: row.page_number })}
      </p>
      <div className="mt-1 rounded-md border bg-surface-raised p-2 text-sm">
        <p className="text-[11px] text-muted-foreground">
          {t("documents.detail.original_read")}
        </p>
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-sans text-sm">
          {row.text ?? ""}
        </pre>
      </div>
      <Label htmlFor={`ocr-${row.id}`} className="mt-2 block text-xs">
        {t("documents.detail.your_corrections")}
      </Label>
      <Textarea
        id={`ocr-${row.id}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        className="mt-1"
      />
      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={() => mut.mutate()}
          disabled={mut.isPending || text === (row.user_corrected_text ?? row.text ?? "")}
        >
          {t("documents.detail.save_corrections")}
        </Button>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/app/documents/$documentId")({
  component: View,
  head: () => ({
    meta: [
      { title: "Document · CaseMap" },
      {
        name: "description",
        content:
          "Preview a document, read the computer-read text, and correct anything that is wrong. Your original file is never changed.",
      },
      { property: "og:title", content: "Document · CaseMap" },
      {
        property: "og:description",
        content: "Preview a document and correct any computer-read text.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
