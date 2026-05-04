// Server-side proxy for EDHREC's unofficial JSON. EDHREC does not send
// Access-Control-Allow-Origin, so browser fetches are blocked by CORS.
// Routing through our API route bypasses that and lets us cache too.
//
// Path mapping:
//   GET /api/edhrec/commanders/tergrid-god-of-fright
//     -> https://json.edhrec.com/pages/commanders/tergrid-god-of-fright.json

import { NextResponse } from "next/server";

const EDHREC_BASE = "https://json.edhrec.com/pages";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params;
  if (!slug || slug.length === 0) {
    return NextResponse.json({ error: "missing_slug" }, { status: 400 });
  }
  // Defensive: only allow [a-z0-9-/] segments. EDHREC slugs never contain
  // anything else; anything weirder is probably abuse.
  for (const seg of slug) {
    if (!/^[a-z0-9-]+$/.test(seg)) {
      return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
    }
  }
  const path = slug.join("/");
  const upstream = `${EDHREC_BASE}/${path}.json`;

  try {
    const res = await fetch(upstream, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Commander-Forge/0.6 (+https://github.com/)",
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "upstream_error", status: res.status }, { status: 404 });
    }
    const body = await res.text();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
}
