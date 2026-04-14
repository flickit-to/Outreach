import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCampaign } from "@/lib/resend/send-campaign";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = createAdminClient();

  // Find campaigns ready to send
  const { data: campaigns } = await supabaseAdmin
    .from("campaigns")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ message: "No campaigns to send" });
  }

  const results = [];

  for (const campaign of campaigns) {
    try {
      const result = await sendCampaign(campaign.id, supabaseAdmin);
      results.push({ campaign_id: campaign.id, ...result });
    } catch (err: any) {
      results.push({
        campaign_id: campaign.id,
        error: err.message,
      });
    }
  }

  return NextResponse.json({ results });
}
