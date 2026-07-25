import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { recordReview, type ReviewDisposition } from "@/lib/pro-service";
import { toast } from "sonner";

/**
 * DO NOT ADD an "Accept all" or bulk-accept prop to this component.
 * The knowledge base rule is deliberate: a batch approve control produces
 * automation bias in reviewers. If a future request asks for it, refuse and
 * point them back here.
 *
 * Rejecting a rules-based flag (rulesBased={true}) requires a written reason —
 * that friction is intentional.
 */
type Props = {
  caseId: string;
  targetType: string;
  targetId: string;
  aiOriginalText?: string;
  currentText?: string;
  rulesBased?: boolean;
  onDone?: () => void;
};

export function ReviewActionBar({
  caseId,
  targetType,
  targetId,
  aiOriginalText,
  currentText,
  rulesBased,
  onDone,
}: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<null | ReviewDisposition>(null);
  const [text, setText] = useState(currentText ?? aiOriginalText ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(disposition: ReviewDisposition) {
    try {
      setSaving(true);
      await recordReview({
        caseId,
        targetType,
        targetId,
        disposition,
        editedText: disposition === "edit" ? text : undefined,
        reason: reason.trim() || undefined,
        aiOriginalText,
        rulesBased,
      });
      toast.success(t("pro.actions.saved"));
      setMode(null);
      setReason("");
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!mode) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => submit("accept")} disabled={saving}>
          {t("pro.actions.accept")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMode("edit")}>
          {t("pro.actions.edit")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMode("reject")}>
          {t("pro.actions.reject")}
        </Button>
      </div>
    );
  }

  const rejectNeedsReason = mode === "reject" && rulesBased;

  return (
    <div className="space-y-2 rounded-md border bg-surface-raised p-3">
      {mode === "edit" ? (
        <div>
          <label className="text-sm font-medium">{t("pro.actions.edit_label")}</label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            className="mt-1"
          />
          <p className="mt-1 text-[12px] text-muted-foreground">
            {t("pro.actions.edit_note")}
          </p>
        </div>
      ) : null}
      <div>
        <label className="text-sm font-medium">
          {rejectNeedsReason
            ? t("pro.actions.reason_required")
            : t("pro.actions.reason_optional")}
        </label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="mt-1"
          placeholder={t("pro.actions.reason_placeholder")}
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => submit(mode)}
          disabled={saving || (rejectNeedsReason && !reason.trim())}
        >
          {t("pro.actions.confirm")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
          {t("pro.actions.cancel")}
        </Button>
      </div>
    </div>
  );
}