// Server-side proxy for Moxfield's public deck JSON. Moxfield doesn't
// send Access-Control-Allow-Origin, so browser fetches are blocked
// by CORS. We hit their API server-side, validate the id shape, and
// pass through the JSON with a short cache.

import { NextResponse } from "next/server";

const MOXFIELD_V3 = "https://api2.moxfield.com/v3/decks/all";
// v2 fallback in case Moxfield rotates URLs; same shape after our mapping.
const MOXFIELD_V2 = "https://api2.moxfield.com/v2/decks/all";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  for (const base of [MOXFIELD_V3, MOXFIELD_V2]) {
    try {
      const res = await fetch(`${base}/${id}`, {
        headers: {
          Accept: "application/json",
          // Moxfield returns 403 to obvious bot UAs without a real-looking
          // string. A neutral browser-style UA gets through.
          "User-Agent":
            "Mozilla/5.0 (compatible; CommanderForge/1.0; +https://github.com/homemade-commander-bot/commander-forge)",
        },
        next: { revalidate: 600 },
      });
      if (res.ok) {
        const body = await res.text();
        return new NextResponse(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
          },
        });
      }
      if (res.status === 404) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      // Any other non-OK: try the v2 fallback before giving up.
    } catch {
      // Network failure — fall through to next base or to the final 502.
    }
  }
  return NextResponse.json({ error: "upstream_failed" }, { status: 502 });
}
