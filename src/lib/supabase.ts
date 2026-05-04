// Optional Supabase client. Returns null if env vars are not configured —
// the app falls back to localStorage-only mode (no accounts required).
//
// To enable cloud sync:
//   1. Create a free Supabase project at https://supabase.com
//   2. Add to .env.local:
//        NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
//        NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
//   3. Run the SQL in `supabase/schema.sql` against your project.
//
// Without these env vars the app keeps working exactly as before — accounts
// are an enhancement, not a requirement.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined = undefined;

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    cached = null;
    return null;
  }
  cached = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return cached;
}

export function isSyncEnabled(): boolean {
  return getSupabase() !== null;
}
