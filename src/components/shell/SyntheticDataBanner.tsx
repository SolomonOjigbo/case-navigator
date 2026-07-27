import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shows when the signed-in account is looking at seeded fixture data, so no one
 * mistakes a synthetic case for a real one. Dev builds only, and only when the
 * case actually carries a SEED- reference — a real case never shows this.
 */
export function SyntheticDataBanner() {
  const [isSynthetic, setIsSynthetic] = useState(false);

  useEffect(() => {
    if (import.meta.env.PROD) return;
    let alive = true;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("cases")
        .select("reference_code")
        .eq("applicant_id", uid)
        .limit(1)
        .maybeSingle();
      if (alive && data?.reference_code?.startsWith("SEED-")) setIsSynthetic(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!isSynthetic) return null;

  return (
    <div
      role="note"
      className="flex items-center gap-2 border-b border-amber-500 bg-amber-50 px-4 py-2 text-[14px] font-medium text-amber-900"
    >
      <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Synthetic test data — this case is fictional development seed data.</span>
    </div>
  );
}
