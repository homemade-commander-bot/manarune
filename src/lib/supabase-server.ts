// Server-side Supabase client for API routes. Reads the user's session
// from the Authorization header (Bearer token) sent by the client.
//
// Returns null if Supabase env vars are not configured — the API routes
// will respond 503 in that case, signalling the client to fall back to
// localStorage-only mode.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getServerSupabase(accessToken: string | null): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}

export function bearerFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}
