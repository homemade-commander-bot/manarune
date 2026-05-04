// GET  /api/decks       — list current user's decks
// POST /api/decks       — upsert a single deck (the client sends the full
//                         Deck object; the server stamps user_id and saves)
//
// Both routes require a Bearer token (Supabase access token) in the
// Authorization header. RLS ensures users only see their own data.

import { NextResponse } from "next/server";
import { bearerFromRequest, getServerSupabase } from "@/lib/supabase-server";
import type { Deck } from "@/lib/types";

export async function GET(req: Request) {
  const token = bearerFromRequest(req);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getServerSupabase(token);
  if (!sb) return NextResponse.json({ error: "sync_not_configured" }, { status: 503 });

  const { data: user, error: userErr } = await sb.auth.getUser();
  if (userErr || !user.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await sb
    .from("decks")
    .select("data")
    .eq("user_id", user.user.id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ decks: (data ?? []).map((row) => row.data as Deck) });
}

export async function POST(req: Request) {
  const token = bearerFromRequest(req);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getServerSupabase(token);
  if (!sb) return NextResponse.json({ error: "sync_not_configured" }, { status: 503 });

  const { data: user, error: userErr } = await sb.auth.getUser();
  if (userErr || !user.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { deck?: Deck };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const deck = body.deck;
  if (!deck || typeof deck.id !== "string" || typeof deck.name !== "string") {
    return NextResponse.json({ error: "invalid_deck" }, { status: 400 });
  }

  const { error } = await sb.from("decks").upsert(
    {
      id: deck.id,
      user_id: user.user.id,
      name: deck.name,
      commander_id: deck.commanderId ?? null,
      partner_id: deck.partnerId ?? null,
      data: deck,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
