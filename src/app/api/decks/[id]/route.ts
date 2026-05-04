// DELETE /api/decks/:id — delete a single deck owned by the current user.

import { NextResponse } from "next/server";
import { bearerFromRequest, getServerSupabase } from "@/lib/supabase-server";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const token = bearerFromRequest(req);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getServerSupabase(token);
  if (!sb) return NextResponse.json({ error: "sync_not_configured" }, { status: 503 });

  const { data: user, error: userErr } = await sb.auth.getUser();
  if (userErr || !user.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const { error } = await sb.from("decks").delete().eq("id", id).eq("user_id", user.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
