import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 1x1 transparent GIF
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(
  request: NextRequest,
  { params }: { params: { sendId: string } }
) {
  const { sendId } = params;

  try {
    const supabase = createAdminClient();

    // Look up the send
    const { data: send } = await supabase
      .from("sends")
      .select("id, contact_id, status")
      .eq("id", sendId)
      .single();

    if (send) {
      // Update send status (watermark: don't downgrade from clicked)
      if (send.status !== "clicked") {
        await supabase
          .from("sends")
          .update({
            status: "opened",
            opened_at: send.status !== "opened" ? new Date().toISOString() : undefined,
          })
          .eq("id", sendId);
      }

      // Log event
      await supabase.from("events").insert({
        send_id: sendId,
        type: "opened",
        ip_address: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "",
        user_agent: request.headers.get("user-agent") || "",
      });

      // Recalculate contact status
      await supabase.rpc("recalculate_contact_status", {
        p_contact_id: send.contact_id,
      });

      // Auto-update lead stage to "opened" (only if in email_sent or follow_up_sent)
      await supabase
        .from("contacts")
        .update({ lead_stage: "opened" })
        .eq("id", send.contact_id)
        .in("lead_stage", ["email_sent", "follow_up_sent"]);
    }
  } catch {
    // Don't fail the pixel response
  }

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
