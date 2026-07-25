// Recovery codes: generate 8 human-friendly codes, hash them, store one-way.
// Codes use Crockford-style base32 without ambiguous characters (no 0/O/1/I/L).
import { supabase } from "@/integrations/supabase/client";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 chars, no O/0/1/I/L

function randomCode(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  // Format XXXXX-XXXXX for readability
  return `${out.slice(0, 5)}-${out.slice(5, 10)}`;
}

export function generateRecoveryCodes(count = 8): string[] {
  const set = new Set<string>();
  while (set.size < count) set.add(randomCode());
  return Array.from(set);
}

export async function hashCode(code: string): Promise<string> {
  const enc = new TextEncoder().encode(code.trim().toUpperCase());
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function saveRecoveryCodes(userId: string, codes: string[]) {
  // Replace any previous codes with this fresh set.
  const { error: delErr } = await supabase
    .from("recovery_codes")
    .delete()
    .eq("user_id", userId);
  if (delErr) throw delErr;

  const rows = await Promise.all(
    codes.map(async (c) => ({ user_id: userId, code_hash: await hashCode(c) })),
  );
  const { error: insErr } = await supabase.from("recovery_codes").insert(rows);
  if (insErr) throw insErr;

  const { error: profErr } = await supabase
    .from("profiles")
    .update({ recovery_codes_saved_at: new Date().toISOString() })
    .eq("id", userId);
  if (profErr) throw profErr;
}