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
    .select("id, send_days")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ message: "No campaigns to send" });
  }

  // Get day of week in Sydney timezone
  const sydneyDay = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Sydney",
    weekday: "short",
  }).format(new Date());
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const today = dayMap[sydneyDay] ?? new Date().getDay();
  const results = [];

  for (const campaign of campaigns) {
    // Skip if today isn't in the campaign's send_days
    const sendDays = campaign.send_days || [1, 2, 3, 4, 5];
    if (!sendDays.includes(today)) {
      results.push({ campaign_id: campaign.id, skipped: true, reason: "Not a send day" });
      continue;
    }

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
