import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: { sendId: string } }
) {
  const { sendId } = params;
  const url = request.nextUrl.searchParams.get("url");
  const linkType = request.nextUrl.searchParams.get("t");

  // Validate URL to prevent open redirect
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();

    // Look up the send
    const { data: send } = await supabase
      .from("sends")
      .select("id, contact_id, opened_at")
      .eq("id", sendId)
      .single();

    if (send) {
      const now = new Date().toISOString();
      // Update send status to clicked — and also set opened_at if missing
      // (some email clients block images, so we never recorded the open)
      const updateData: any = {
        status: "clicked",
        clicked_at: now,
      };
      if (!send.opened_at) {
        updateData.opened_at = now;
      }

      await supabase
        .from("sends")
        .update(updateData)
        .eq("id", sendId);

      // Log event
      await supabase.from("events").insert({
        send_id: sendId,
        type: "clicked",
        metadata: { url, ...(linkType ? { linkType } : {}) },
        ip_address: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "",
        user_agent: request.headers.get("user-agent") || "",
      });

      // Recalculate contact status (email status)
      await supabase.rpc("recalculate_contact_status", {
        p_contact_id: send.contact_id,
      });

      // Auto-advance lead stage to "opened" if still in earlier stage
      // (Click implies open, even if pixel didn't fire)
      await supabase
        .from("contacts")
        .update({ lead_stage: "opened" })
        .eq("id", send.contact_id)
        .in("lead_stage", ["new_lead", "email_sent", "follow_up_sent", "follow_up_needed"]);
    }
  } catch {
    // Don't block the redirect
  }

  return NextResponse.redirect(url, 302);
}
