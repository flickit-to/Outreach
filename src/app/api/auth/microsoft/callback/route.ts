import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCodeForToken, getProfile } from "@/lib/microsoft/graph";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?integration=outlook&error=${encodeURIComponent(errorDesc || error)}`, request.url),
    );
  }

  const expectedState = cookies().get("ms_oauth_state")?.value;
  cookies().delete("ms_oauth_state");

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(
      new URL("/settings?integration=outlook&error=invalid_state", request.url),
    );
  }

  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const host = process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") || "localhost:3000";
  const redirectUri = `${proto}://${host}/api/auth/microsoft/callback`;

  try {
    const tokens = await exchangeCodeForToken(code, redirectUri);
    const profile = await getProfile(tokens.access_token);

    const mailboxAddress = (profile.mail || profile.userPrincipalName || "").toLowerCase();
    if (!mailboxAddress) {
      throw new Error("Could not determine mailbox address from Graph profile");
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const admin = createAdminClient();
    const { error: upErr } = await admin
      .from("outlook_connections")
      .upsert(
        {
          user_id: user.id,
          mailbox_address: mailboxAddress,
          display_name: profile.displayName ?? null,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: expiresAt,
          scopes: tokens.scope,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,mailbox_address" },
      );
    if (upErr) throw upErr;
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(
        `/settings?integration=outlook&error=${encodeURIComponent(e.message || "callback_failed")}`,
        request.url,
      ),
    );
  }

  return NextResponse.redirect(new URL("/settings?integration=outlook&connected=1", request.url));
}
