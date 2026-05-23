// Optional Supabase browser client. Returns null if env vars are not
// configured — the app falls back to localStorage-only mode (no accounts
// required) in that case.
//
// To enable cloud sync:
//   1. Create a free Supabase project at https://supabase.com
//   2. Add to .env.local (and Vercel env vars):
//        NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
//        NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
//   3. Run the SQL in `supabase/schema.sql` against your project.
//
// Without these env vars the app keeps working exactly as before — accounts
// are an enhancement, not a requirement.
//
// Why @supabase/ssr (not @supabase/supabase-js directly)?
// `createBrowserClient` stores the session in cookies as well as
// localStorage. That means a Next.js route handler (e.g. /auth/callback)
// can read the session server-side after the magic-link exchange, which
// the plain client cannot do. Required for PKCE + OAuth flows.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined = undefined;

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    cached = null;
    return null;
  }
  // PKCE is the recommended flow for OAuth and the more secure variant of
  // magic-link. The auth callback route at /auth/callback exchanges the
  // ?code param for a session.
  cached = createBrowserClient(url, key, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return cached;
}

export function isSyncEnabled(): boolean {
  return getSupabase() !== null;
}
