import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CampaignList } from "@/components/campaigns/campaign-list";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { CampaignWithStats } from "@/lib/types";

export default async function CampaignsPage() {
  const supabase = createClient();

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  // Get stats for each campaign
  const campaignsWithStats: CampaignWithStats[] = [];

  if (campaigns) {
    for (const campaign of campaigns) {
      const { data: sends } = await supabase
        .from("sends")
        .select("status")
        .eq("campaign_id", campaign.id);

      const total = sends?.length || 0;
      const sent = sends?.filter((s) => s.status !== "pending" && s.status !== "failed").length || 0;
      const delivered = sends?.filter((s) => ["delivered", "opened", "clicked"].includes(s.status)).length || 0;
      const opened = sends?.filter((s) => ["opened", "clicked"].includes(s.status)).length || 0;
      const clicked = sends?.filter((s) => s.status === "clicked").length || 0;
      const bounced = sends?.filter((s) => s.status === "bounced").length || 0;

      campaignsWithStats.push({
        ...campaign,
        total_recipients: total,
        sent_count: sent,
        delivered_count: delivered,
        opened_count: opened,
        clicked_count: clicked,
        bounced_count: bounced,
      });
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <Link href="/campaigns/new">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        </Link>
      </div>
      <CampaignList campaigns={campaignsWithStats} />
    </div>
  );
}
