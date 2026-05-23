// GET /auth/callback?code=<code>&next=<path>
//
// Handles the redirect back from a Supabase magic-link or OAuth provider:
//   1. Reads the one-time `code` query param.
//   2. Exchanges it for a session via Supabase (PKCE flow).
//   3. Writes the session cookies via @supabase/ssr's cookie adapter.
//   4. Redirects the browser to `next` (validated to be a relative path
//      so this can't be abused as an open redirect).
//
// On any error we redirect back to the home page with a short error code
// in the query string so the client can surface it. We never leak Supabase
// error messages verbatim (potential info-disclosure).
//
// This route is the LANDING for every sign-in. It must be in the
// allowlist under Supabase → Auth → URL Configuration → Redirect URLs.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(req: Request) {
  const reqUrl = new URL(req.url);
  const code = reqUrl.searchParams.get("code");
  const rawNext = reqUrl.searchParams.get("next") ?? "/";

  // Defense against open redirect via crafted ?next=https://evil.com
  // Only allow relative paths that start with a single `/`.
  const safeNext =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (!code) {
    return NextResponse.redirect(new URL("/?auth_error=missing_code", reqUrl));
  }

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) {
    // Env vars missing — sync isn't configured at all. Bounce home with
    // a flag rather than throw a 500.
    return NextResponse.redirect(new URL("/?auth_error=not_configured", reqUrl));
  }

  const cookieStore = await cookies();
  const sb = createServerClient(supaUrl, supaKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          // The cookies() API throws in some Server Component contexts.
          // We're in a Route Handler so this is fine, but the try/catch
          // is harmless defense-in-depth.
          try {
            cookieStore.set(name, value, options);
          } catch {
            /* noop */
          }
        }
      },
    },
  });

  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    // Don't leak the underlying error string — log to the server, return a
    // generic code to the client.
    console.error("[auth/callback] exchange failed:", error.message);
    return NextResponse.redirect(new URL("/?auth_error=exchange_failed", reqUrl));
  }

  return NextResponse.redirect(new URL(safeNext, reqUrl));
}
