"use client";

import Link from "next/link";
import type { CampaignWithStats } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CampaignActions } from "./campaign-actions";
import { CampaignCountdown } from "./campaign-countdown";
import { Pencil, CornerDownRight } from "lucide-react";
import { getStatusColor, formatDate } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function CampaignList({
  campaigns,
}: {
  campaigns: CampaignWithStats[];
}) {
  if (campaigns.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        No campaigns yet. Create your first campaign.
      </div>
    );
  }

  // Group: main campaigns at top, then their sub-campaigns nested under
  const mains = campaigns.filter((c) => !c.parent_campaign_id);
  const subsByParent = new Map<string, CampaignWithStats[]>();
  campaigns.forEach((c) => {
    if (c.parent_campaign_id) {
      if (!subsByParent.has(c.parent_campaign_id)) subsByParent.set(c.parent_campaign_id, []);
      subsByParent.get(c.parent_campaign_id)!.push(c);
    }
  });

  // Build flat list with main + sub interleaved
  const ordered: { campaign: CampaignWithStats; isSub: boolean }[] = [];
  mains.forEach((m) => {
    ordered.push({ campaign: m, isSub: false });
    (subsByParent.get(m.id) || []).forEach((s) => {
      ordered.push({ campaign: s, isSub: true });
    });
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Recipients</TableHead>
            <TableHead className="text-right">Open Rate</TableHead>
            <TableHead className="text-right">Click Rate</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordered.map(({ campaign, isSub }) => {
            const openRate =
              campaign.delivered_count > 0
                ? Math.round((campaign.opened_count / campaign.delivered_count) * 100)
                : 0;
            const clickRate =
              campaign.delivered_count > 0
                ? Math.round((campaign.clicked_count / campaign.delivered_count) * 100)
                : 0;

            return (
              <TableRow key={campaign.id} className={isSub ? "bg-muted/30" : ""}>
                <TableCell>
                  <div className={`flex items-center gap-2 ${isSub ? "pl-6" : ""}`}>
                    {isSub && <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    <Link href={`/campaigns/${campaign.id}`} className="font-medium hover:underline">
                      {campaign.name}
                    </Link>
                    {isSub && campaign.trigger_engagement && (
                      <Badge variant="outline" className="text-[10px]">
                        {campaign.trigger_engagement.replace("_", " ")}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-xs truncate">{campaign.subject}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant="secondary" className={`${getStatusColor(campaign.status)} w-fit`}>
                      {campaign.status === "cancelled" ? "paused" : campaign.status}
                    </Badge>
                    {campaign.status === "scheduled" && campaign.scheduled_at && (
                      <CampaignCountdown scheduledAt={campaign.scheduled_at} />
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">{campaign.total_recipients}</TableCell>
                <TableCell className="text-right">{openRate}%</TableCell>
                <TableCell className="text-right">{clickRate}%</TableCell>
                <TableCell>{formatDate(campaign.created_at)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {["draft", "scheduled"].includes(campaign.status) && (
                      <Link href={`/campaigns/${campaign.id}/edit`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                    )}
                    <CampaignActions
                      campaignId={campaign.id}
                      status={campaign.status}
                      campaignName={campaign.name}
                      variant="dropdown"
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
