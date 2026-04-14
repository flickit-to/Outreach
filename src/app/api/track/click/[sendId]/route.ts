import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: { sendId: string } }
) {
  const { sendId } = params;
  const url = request.nextUrl.searchParams.get("url");

  // Validate URL to prevent open redirect
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();

    // Look up the send
    const { data: send } = await supabase
      .from("sends")
      .select("id, contact_id")
      .eq("id", sendId)
      .single();

    if (send) {
      // Update send status to clicked (highest engagement)
      await supabase
        .from("sends")
        .update({
          status: "clicked",
          clicked_at: new Date().toISOString(),
        })
        .eq("id", sendId);

      // Log event
      await supabase.from("events").insert({
        send_id: sendId,
        type: "clicked",
        metadata: { url },
        ip_address: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "",
        user_agent: request.headers.get("user-agent") || "",
      });

      // Recalculate contact status
      await supabase.rpc("recalculate_contact_status", {
        p_contact_id: send.contact_id,
      });
    }
  } catch {
    // Don't block the redirect
  }

  return NextResponse.redirect(url, 302);
}
