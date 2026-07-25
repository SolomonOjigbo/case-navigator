import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { getOrCreateOwnCase } from "@/lib/case-service";
import {
  ALL_SCOPES,
  buildSharePreview,
  cancelDeletionRequest,
  createGrant,
  exportCaseZip,
  listDeletionRequests,
  listGrants,
  listPrivateHold,
  listVerifiedProfessionals,
  requestDeletion,
  revokeGrant,
  type Scope,
} from "@/lib/sharing-service";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

function View() {
  const { t } = useTranslation();
  const { user } = useSession();
  const caseQ = useQuery({
    queryKey: ["own-case", user?.id],
    queryFn: () => getOrCreateOwnCase(user!.id),
    enabled: !!user,
  });
  const caseId = caseQ.data?.id;

  return (
    <div className="reading-column py-8">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        {t("sharing.heading")}
      </h1>
      <p className="mt-2 text-[15px] text-muted-foreground">{t("sharing.intro")}</p>

      {!caseId ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("sharing.loading")}</p>
      ) : (
        <Tabs defaultValue="share" className="mt-6">
          <TabsList>
            <TabsTrigger value="share">{t("sharing.tab_share")}</TabsTrigger>
            <TabsTrigger value="hold">{t("sharing.tab_hold")}</TabsTrigger>
            <TabsTrigger value="data">{t("sharing.tab_data")}</TabsTrigger>
          </TabsList>
          <TabsContent value="share" className="mt-4">
            <ShareTab caseId={caseId} userId={user!.id} />
          </TabsContent>
          <TabsContent value="hold" className="mt-4">
            <PrivateHoldTab caseId={caseId} />
          </TabsContent>
          <TabsContent value="data" className="mt-4">
            <DataControlsTab caseId={caseId} userId={user!.id} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ShareTab({ caseId, userId }: { caseId: string; userId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const pros = useQuery({ queryKey: ["pros"], queryFn: listVerifiedProfessionals });
  const grants = useQuery({ queryKey: ["grants", caseId], queryFn: () => listGrants(caseId) });

  const [proId, setProId] = useState<string>("");
  const [scopes, setScopes] = useState<Scope[]>([]);
  const defaultExpiry = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  }, []);
  const [expiry, setExpiry] = useState<string>(defaultExpiry);
  const [note, setNote] = useState<string>("");
  const [showPreview, setShowPreview] = useState(false);

  const previewQ = useQuery({
    queryKey: ["preview", caseId, scopes.join(",")],
    queryFn: () => buildSharePreview(caseId, scopes),
    enabled: showPreview && scopes.length > 0,
  });

  const createM = useMutation({
    mutationFn: () =>
      createGrant({
        caseId,
        userId,
        professionalId: proId,
        scopes,
        expiresAt: new Date(expiry + "T23:59:59").toISOString(),
        purposeNote: note || undefined,
      }),
    onSuccess: () => {
      toast.success(t("sharing.share_created"));
      setProId("");
      setScopes([]);
      setNote("");
      setShowPreview(false);
      qc.invalidateQueries({ queryKey: ["grants", caseId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeM = useMutation({
    mutationFn: (grantId: string) => revokeGrant({ grantId, userId, caseId }),
    onSuccess: () => {
      toast.success(t("sharing.revoked"));
      qc.invalidateQueries({ queryKey: ["grants", caseId] });
    },
  });

  const toggleScope = (s: Scope, on: boolean) => {
    setScopes((prev) => (on ? [...new Set([...prev, s])] : prev.filter((x) => x !== s)));
    setShowPreview(false);
  };

  const activeGrants = (grants.data ?? []).filter(
    (g) => !g.revoked_at && new Date(g.expires_at) > new Date(),
  );
  const pastGrants = (grants.data ?? []).filter(
    (g) => g.revoked_at || new Date(g.expires_at) <= new Date(),
  );

  return (
    <div className="space-y-8">
      <section className="rounded-lg border bg-surface-raised p-5">
        <h2 className="text-lg font-semibold">{t("sharing.new_grant_heading")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("sharing.new_grant_intro")}</p>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="pro">{t("sharing.pick_professional")}</Label>
            <select
              id="pro"
              value={proId}
              onChange={(e) => setProId(e.target.value)}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">{t("sharing.pick_placeholder")}</option>
              {(pros.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name ?? t("sharing.unnamed_pro")}
                  {p.license_jurisdiction ? ` — ${p.license_jurisdiction}` : ""}
                </option>
              ))}
            </select>
            {(pros.data ?? []).length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("sharing.no_pros_yet")}
              </p>
            ) : null}
          </div>

          <fieldset>
            <legend className="text-sm font-medium">{t("sharing.pick_scopes")}</legend>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("sharing.pick_scopes_hint")}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {ALL_SCOPES.map((s) => (
                <label
                  key={s}
                  className="flex items-start gap-2 rounded-md border p-3 text-sm"
                >
                  <Checkbox
                    checked={scopes.includes(s)}
                    onCheckedChange={(v) => toggleScope(s, v === true)}
                    aria-label={t(`sharing.scope.${s}`)}
                  />
                  <span>{t(`sharing.scope.${s}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <Label htmlFor="expiry">{t("sharing.expiry_label")}</Label>
            <Input
              id="expiry"
              type="date"
              value={expiry}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => {
                setExpiry(e.target.value);
                setShowPreview(false);
              }}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("sharing.expiry_hint")}</p>
          </div>

          <div>
            <Label htmlFor="note">{t("sharing.note_label")}</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("sharing.note_placeholder")}
              rows={2}
            />
          </div>

          {!showPreview ? (
            <Button
              type="button"
              onClick={() => setShowPreview(true)}
              disabled={!proId || scopes.length === 0}
            >
              {t("sharing.preview_button")}
            </Button>
          ) : (
            <div className="rounded-md border bg-background p-4">
              <h3 className="text-sm font-semibold">{t("sharing.preview_heading")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("sharing.preview_intro")}
              </p>
              {previewQ.data ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {scopes.map((s) => {
                    const p = previewQ.data;
                    const line =
                      s === "story"
                        ? t("sharing.preview.story", {
                            n: p.story.total,
                            hidden: p.story.onHold,
                          })
                        : s === "documents"
                          ? t("sharing.preview.documents", {
                              n: p.documents.total,
                              hidden: p.documents.onHold,
                            })
                          : s === "timeline"
                            ? t("sharing.preview.timeline", {
                                n: p.timeline.total,
                                hidden: p.timeline.onHold,
                              })
                            : s === "evidence_map"
                              ? t("sharing.preview.evidence_map", { n: p.evidence_map.total })
                              : s === "questions"
                                ? t("sharing.preview.questions", { n: p.questions.total })
                                : t("sharing.preview.attention", { n: p.attention.total });
                    return (
                      <li key={s} className="flex items-start gap-2">
                        <span aria-hidden>•</span>
                        <span>{line}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  {t("sharing.preview_loading")}
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                {t("sharing.preview_hold_note")}
              </p>
              <div className="mt-4 flex gap-2">
                <Button
                  onClick={() => createM.mutate()}
                  disabled={createM.isPending || !previewQ.data}
                >
                  {t("sharing.confirm_share")}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setShowPreview(false)}
                  disabled={createM.isPending}
                >
                  {t("sharing.back")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">{t("sharing.active_heading")}</h2>
        {activeGrants.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("sharing.no_active")}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {activeGrants.map((g) => (
              <li key={g.id} className="rounded-md border bg-surface-raised p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-foreground">
                      {g.professionals?.display_name ?? t("sharing.unnamed_pro")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("sharing.expires_on", {
                        date: new Date(g.expires_at).toLocaleDateString(),
                      })}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1 text-xs">
                      {(g.scopes as Scope[]).map((s) => (
                        <span key={s} className="rounded bg-muted px-2 py-0.5">
                          {t(`sharing.scope.${s}`)}
                        </span>
                      ))}
                    </div>
                    {g.purpose_note ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {g.purpose_note}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (
                        window.confirm(
                          t("sharing.revoke_confirm", {
                            name:
                              g.professionals?.display_name ?? t("sharing.unnamed_pro"),
                          }),
                        )
                      ) {
                        revokeM.mutate(g.id);
                      }
                    }}
                    disabled={revokeM.isPending}
                  >
                    {t("sharing.revoke")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pastGrants.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold">{t("sharing.past_heading")}</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {pastGrants.map((g) => (
              <li key={g.id} className="rounded border p-3">
                <div>{g.professionals?.display_name ?? t("sharing.unnamed_pro")}</div>
                <div className="text-xs">
                  {g.revoked_at
                    ? t("sharing.access_ended_on", {
                        date: new Date(g.revoked_at).toLocaleDateString(),
                      })
                    : t("sharing.expired_on", {
                        date: new Date(g.expires_at).toLocaleDateString(),
                      })}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function PrivateHoldTab({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["hold", caseId],
    queryFn: () => listPrivateHold(caseId),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-surface-raised p-4">
        <p className="text-sm text-foreground">{t("sharing.hold_intro")}</p>
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("sharing.loading")}</p>
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("sharing.hold_empty")}</p>
      ) : (
        <ul className="space-y-2">
          {(q.data ?? []).map((item) => (
            <li
              key={`${item.kind}-${item.id}`}
              className="rounded-md border bg-background p-3 text-sm"
            >
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t(`sharing.hold_kind.${item.kind}`)}
              </div>
              <div className="font-medium text-foreground">{item.label}</div>
              {item.detail ? (
                <div className="text-xs text-muted-foreground">{item.detail}</div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("sharing.hold_toggle_hint")}</p>
    </div>
  );
}

function DataControlsTab({ caseId, userId }: { caseId: string; userId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const requests = useQuery({
    queryKey: ["deletion", caseId],
    queryFn: () => listDeletionRequests(caseId),
  });

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportCaseZip(caseId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `casemap-export-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("sharing.export_done"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const requestM = useMutation({
    mutationFn: () => requestDeletion({ caseId, userId, reason: reason || undefined }),
    onSuccess: () => {
      toast.success(t("sharing.deletion_requested"));
      setReason("");
      qc.invalidateQueries({ queryKey: ["deletion", caseId] });
    },
  });

  const cancelM = useMutation({
    mutationFn: (id: string) => cancelDeletionRequest({ requestId: id, userId, caseId }),
    onSuccess: () => {
      toast.success(t("sharing.deletion_cancelled"));
      qc.invalidateQueries({ queryKey: ["deletion", caseId] });
    },
  });

  const pending = (requests.data ?? []).find((r) => r.status === "requested");

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-surface-raised p-5">
        <h2 className="text-lg font-semibold">{t("sharing.export_heading")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("sharing.export_intro")}</p>
        <Button className="mt-3" onClick={handleExport} disabled={exporting}>
          {exporting ? t("sharing.export_working") : t("sharing.export_button")}
        </Button>
      </section>

      <section className="rounded-lg border bg-surface-raised p-5">
        <h2 className="text-lg font-semibold">{t("sharing.delete_heading")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("sharing.delete_intro")}</p>
        {pending ? (
          <div className="mt-4 rounded-md border bg-background p-4 text-sm">
            <p>
              {t("sharing.delete_pending", {
                date: new Date(pending.scheduled_for).toLocaleDateString(),
              })}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => cancelM.mutate(pending.id)}
              disabled={cancelM.isPending}
            >
              {t("sharing.delete_cancel")}
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="reason">{t("sharing.delete_reason_label")}</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder={t("sharing.delete_reason_placeholder")}
              />
            </div>
            <Button
              variant="destructive"
              onClick={() => {
                if (window.confirm(t("sharing.delete_confirm"))) requestM.mutate();
              }}
              disabled={requestM.isPending}
            >
              {t("sharing.delete_button")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

export const Route = createFileRoute("/app/sharing")({
  component: View,
  head: () => ({
    meta: [
      { title: "Privacy and Sharing · CaseMap" },
      {
        name: "description",
        content:
          "Choose exactly what to share with a legal professional, keep items on private hold, and review your data controls.",
      },
    ],
  }),
});