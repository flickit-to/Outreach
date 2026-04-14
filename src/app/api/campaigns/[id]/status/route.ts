import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action } = await request.json();

  // Verify campaign ownership
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, status")
    .eq("id", params.id)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  switch (action) {
    case "pause": {
      if (!["scheduled", "sending"].includes(campaign.status)) {
        return NextResponse.json({ error: "Can only pause scheduled or sending campaigns" }, { status: 400 });
      }
      await supabase.from("campaigns").update({ status: "cancelled" }).eq("id", params.id);
      return NextResponse.json({ ok: true, status: "cancelled" });
    }

    case "resume": {
      if (campaign.status !== "cancelled") {
        return NextResponse.json({ error: "Can only resume paused campaigns" }, { status: 400 });
      }
      await supabase.from("campaigns").update({ status: "scheduled", scheduled_at: new Date().toISOString() }).eq("id", params.id);
      return NextResponse.json({ ok: true, status: "scheduled" });
    }

    case "delete": {
      // Delete sends and events first (cascade should handle it, but be safe)
      await supabase.from("campaign_contacts").delete().eq("campaign_id", params.id);
      await supabase.from("sends").delete().eq("campaign_id", params.id);
      await supabase.from("campaigns").delete().eq("id", params.id);
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}
