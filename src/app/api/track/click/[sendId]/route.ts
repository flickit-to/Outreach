import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  "bot",
  "spider",
  "crawler",
];

function isLikelyBot(userAgent: string, sentAt: string | null): { isBot: boolean; reason: string } {
  const ua = (userAgent || "").toLowerCase();

  for (const pattern of BOT_PATTERNS) {
    if (ua.includes(pattern)) {
      return { isBot: true, reason: `bot_ua:${pattern}` };
    }
  }

  if (sentAt) {
    const diffSeconds = (Date.now() - new Date(sentAt).getTime()) / 1000;
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
  const url = request.nextUrl.searchParams.get("url");
  const linkType = request.nextUrl.searchParams.get("t");

  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();

    const { data: send } = await supabase
      .from("sends")
      .select("id, contact_id, opened_at, sent_at")
      .eq("id", sendId)
      .single();

    if (send) {
      const userAgent = request.headers.get("user-agent") || "";
      const { isBot, reason } = isLikelyBot(userAgent, send.sent_at);

      if (isBot) {
        // Log bot click but DON'T update send status
        await supabase.from("events").insert({
          send_id: sendId,
          type: "clicked",
          metadata: { url, bot: true, reason, ...(linkType ? { linkType } : {}) },
          ip_address: request.headers.get("x-forwarded-for") || "",
          user_agent: userAgent,
        });
      } else {
        // Real click — update send status
        const now = new Date().toISOString();
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

        await supabase.from("events").insert({
          send_id: sendId,
          type: "clicked",
          metadata: { url, bot: false, ...(linkType ? { linkType } : {}) },
          ip_address: request.headers.get("x-forwarded-for") || "",
          user_agent: userAgent,
        });

        // Recalculate contact status
        await supabase.rpc("recalculate_contact_status", {
          p_contact_id: send.contact_id,
        });

        // Auto-advance lead stage
        await supabase
          .from("contacts")
          .update({ lead_stage: "opened" })
          .eq("id", send.contact_id)
          .in("lead_stage", ["new_lead", "email_sent", "follow_up_sent", "follow_up_needed"]);
      }
    }
  } catch {
    // Don't block the redirect
  }

  return NextResponse.redirect(url, 302);
}
