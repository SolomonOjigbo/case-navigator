import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { hasActiveConsent, type ConsentType } from "@/lib/consent-service";
import { useSession } from "@/hooks/use-session";

export function useConsent(type: ConsentType) {
  const { user, loading: sessionLoading } = useSession();
  const [granted, setGranted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setGranted(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const ok = await hasActiveConsent(user.id, type);
      setGranted(ok);
    } finally {
      setLoading(false);
    }
  }, [user, type]);

  useEffect(() => {
    if (!sessionLoading) refresh();
  }, [sessionLoading, refresh]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`consent-${user.id}-${type}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "consent_records",
          filter: `applicant_id=eq.${user.id}`,
        },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, type, refresh]);

  return { granted, loading, refresh };
}