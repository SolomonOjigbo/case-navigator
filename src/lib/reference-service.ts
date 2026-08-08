// Reference data: the small, slow-moving lists the forms need.
import { supabase } from "@/integrations/supabase/client";

export type Jurisdiction = { code: string; name: string };

/**
 * Active jurisdictions, for the pickers. Readable by anyone signed in — the
 * table is a list of place names, not anyone's data.
 */
export async function listJurisdictions(): Promise<Jurisdiction[]> {
  const { data, error } = await supabase
    .from("jurisdictions")
    .select("code, name")
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Jurisdiction[];
}
