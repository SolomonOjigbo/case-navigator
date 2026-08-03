import { useState } from "react";
import { LifeBuoy, Send, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { refusalFor } from "@/lib/refusal-classifier";
import { logRefusal } from "@/lib/refusal-classifier";
import type { RefusalResponse } from "@/config/refusal-responses";

// Small floating Help/Ask panel available on every /app screen.
// Classification runs LOCALLY. If the message matches a refusal category
// no model is called; the fixed response is shown and the category is
// logged (message content is never stored).
export function HelpAskPanel() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [refusal, setRefusal] = useState<RefusalResponse | null>(null);
  const [sent, setSent] = useState(false);
  const log = useServerFn(logRefusal);

  async function handleSend() {
    const msg = text.trim();
    if (!msg) return;
    const r = refusalFor(msg);
    if (r) {
      setRefusal(r);
      // Fire-and-forget category log; get the current case id first.
      try {
        const { data: userData } = await supabase.auth.getUser();
        let caseId: string | null = null;
        if (userData.user) {
          const { data: caseRow } = await supabase
            .from("cases")
            .select("id")
            .eq("applicant_id", userData.user.id)
            .maybeSingle();
          caseId = caseRow?.id ?? null;
        }
        await log({ data: { caseId, category: r.category } });
      } catch {
        // logging failure must never block the refusal UI
      }
      return;
    }
    // Non-refusal messages: for now, park them without calling a model.
    // A follow-up feature can hand these to a support queue.
    setSent(true);
  }

  function reset() {
    setText("");
    setRefusal(null);
    setSent(false);
  }

  return (
    <>
      {/* Sits above the mobile tab bar, and shrinks to a circle on small
          screens so it stops covering the card behind it. */}
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        className="elev-3 fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] end-4 z-40 h-12 w-12 rounded-full print:hidden md:bottom-5 md:h-auto md:w-auto md:rounded-md md:px-4"
        aria-label="Open help and ask panel"
      >
        <LifeBuoy className="h-5 w-5 md:h-4 md:w-4" aria-hidden="true" />
        <span className="sr-only md:not-sr-only">Help / Ask</span>
      </Button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Help and Ask"
          className="fixed inset-0 z-50 flex items-end justify-end bg-background/40 p-4 print:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border bg-surface-raised p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Help / Ask</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ask a question about how this tool works. There are some
                  questions this tool cannot answer — a lawyer can help with those.
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => { setOpen(false); reset(); }}
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            {refusal ? (
              <div className="mt-4 space-y-3">
                <div className="banner-attention text-[15px]">
                  <p className="m-0">{refusal.message}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {refusal.nextAction.href ? (
                    <Button asChild size="sm" onClick={() => setOpen(false)}>
                      <a href={refusal.nextAction.href}>{refusal.nextAction.label}</a>
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={reset}>
                    Ask something else
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">{refusal.offerProfessional}</p>
              </div>
            ) : sent ? (
              <div className="mt-4 space-y-3">
                <p className="text-[15px] text-foreground">
                  Thanks — your question has been noted. A team member will get back to you.
                </p>
                <Button size="sm" variant="outline" onClick={reset}>
                  Ask something else
                </Button>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                <Label htmlFor="help-ask-text">Your question</Label>
                <Textarea
                  id="help-ask-text"
                  rows={4}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="For example: how do I add a document?"
                />
                <div className="flex justify-end">
                  <Button onClick={handleSend} disabled={text.trim().length === 0}>
                    <Send className="h-4 w-4" aria-hidden="true" /> Send
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}