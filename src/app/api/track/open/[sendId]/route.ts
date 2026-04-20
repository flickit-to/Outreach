import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 1x1 transparent GIF
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// Bot detection: known bot/proxy user agents
const BOT_PATTERNS = [
  "googleimageproxy",
  "feedfetcher",
  "google-smtp",
  "outlook-proxy",
  "microsoft office",
  "mimecast",
  "barracuda",
  "proofpoint",
  "symantec",
  "mcafee",
];

function isLikelyBot(userAgent: string, sentAt: string | null): { isBot: boolean; reason: string } {
  const ua = (userAgent || "").toLowerCase();

  // Check known bot user agents
  for (const pattern of BOT_PATTERNS) {
    if (ua.includes(pattern)) {
      return { isBot: true, reason: `bot_ua:${pattern}` };
    }
  }

  // Check timing: if opened within 30s of sending, likely a proxy/bot
  if (sentAt) {
    const sentTime = new Date(sentAt).getTime();
    const now = Date.now();
    const diffSeconds = (now - sentTime) / 1000;
    if (diffSeconds < 30) {
      return { isBot: true, reason: `too_fast:${Math.round(diffSeconds)}s` };
    }
  }

  return { isBot: false, reason: "" };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { sendId: string } }
) {
  const { sendId } = params;

  try {
    const supabase = createAdminClient();

    const { data: send } = await supabase
      .from("sends")
      .select("id, contact_id, status, sent_at")
      .eq("id", sendId)
      .single();

    if (send) {
      const userAgent = request.headers.get("user-agent") || "";
      const { isBot, reason } = isLikelyBot(userAgent, send.sent_at);

      if (isBot) {
        // Log the bot event but DON'T update send status or opened_at
        await supabase.from("events").insert({
          send_id: sendId,
          type: "opened",
          metadata: { bot: true, reason },
          ip_address: request.headers.get("x-forwarded-for") || "",
          user_agent: userAgent,
        });
      } else {
        // Real open — update send status
        if (send.status !== "clicked" && send.status !== "replied") {
          await supabase
            .from("sends")
            .update({
              status: "opened",
              opened_at: new Date().toISOString(),
            })
            .eq("id", sendId);
        }

        await supabase.from("events").insert({
          send_id: sendId,
          type: "opened",
          metadata: { bot: false },
          ip_address: request.headers.get("x-forwarded-for") || "",
          user_agent: userAgent,
        });

        // Recalculate contact status
        await supabase.rpc("recalculate_contact_status", {
          p_contact_id: send.contact_id,
        });

        // Auto-update lead stage
        await supabase
          .from("contacts")
          .update({ lead_stage: "opened" })
          .eq("id", send.contact_id)
          .in("lead_stage", ["email_sent", "follow_up_sent"]);
      }
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
