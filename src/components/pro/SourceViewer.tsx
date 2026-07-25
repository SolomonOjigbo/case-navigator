import { createContext, useContext, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

/**
 * Slide-over source viewer for the professional workspace.
 * Wire ANY citation to `useSourceViewer().open(...)`. Do not build separate
 * source viewers in individual tabs — that would let AI-summary framings and
 * source context drift apart.
 */
export type SourceTarget =
  | {
      kind: "document";
      documentId: string;
      page?: number | null;
      label?: string;
      excerpt?: string;
    }
  | {
      kind: "story";
      answerId?: string;
      sectionKey?: string;
      charStart?: number | null;
      charEnd?: number | null;
      label?: string;
      excerpt?: string;
    };

type Ctx = {
  open: (target: SourceTarget) => void;
  close: () => void;
};

const SourceViewerContext = createContext<Ctx | null>(null);

export function useSourceViewer() {
  const ctx = useContext(SourceViewerContext);
  if (!ctx) throw new Error("useSourceViewer must be used inside <SourceViewerProvider>");
  return ctx;
}

export function SourceViewerProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<SourceTarget | null>(null);

  return (
    <SourceViewerContext.Provider
      value={{ open: setTarget, close: () => setTarget(null) }}
    >
      {children}
      <Sheet open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {target?.kind === "document"
                ? t("pro.source_viewer.document_title", {
                    page: target.page ?? "?",
                  })
                : t("pro.source_viewer.story_title")}
            </SheetTitle>
            <SheetDescription>
              {target?.label ?? t("pro.source_viewer.default_label")}
            </SheetDescription>
          </SheetHeader>
          {target?.excerpt ? (
            <blockquote className="mt-4 border-l-4 border-accent bg-surface-raised p-3 text-[15px] text-foreground">
              {target.excerpt}
            </blockquote>
          ) : null}
          <p className="mt-4 text-[13px] text-muted-foreground">
            {t("pro.source_viewer.note")}
          </p>
        </SheetContent>
      </Sheet>
    </SourceViewerContext.Provider>
  );
}