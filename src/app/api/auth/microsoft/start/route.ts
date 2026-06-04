import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizeUrl } from "@/lib/microsoft/graph";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const state = randomBytes(16).toString("hex");

  // Store state in a short-lived cookie so we can verify on callback (CSRF protection).
  cookies().set("ms_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  });

  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const host = process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") || "localhost:3000";
  const redirectUri = `${proto}://${host}/api/auth/microsoft/callback`;

  return NextResponse.redirect(getAuthorizeUrl(state, redirectUri));
}
