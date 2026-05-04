// GET /api/auth/session — verifies the current Bearer token and returns
// the user object, or 401 if unauthenticated. Used by the client to
// confirm a session is valid.

import { NextResponse } from "next/server";
import { bearerFromRequest, getServerSupabase } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const token = bearerFromRequest(req);
  if (!token) return NextResponse.json({ user: null }, { status: 200 });

  const sb = getServerSupabase(token);
  if (!sb) return NextResponse.json({ error: "sync_not_configured" }, { status: 503 });

  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return NextResponse.json({ user: null }, { status: 200 });
  return NextResponse.json({
    user: { id: data.user.id, email: data.user.email },
  });
}
