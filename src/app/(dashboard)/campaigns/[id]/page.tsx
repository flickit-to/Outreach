import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CampaignStats } from "@/components/campaigns/campaign-stats";
import { ABComparison } from "@/components/campaigns/ab-comparison";
import { MarkRepliedButton } from "@/components/campaigns/mark-replied-button";
import { TimeToOpenCard } from "@/components/campaigns/time-to-open-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CampaignActions } from "@/components/campaigns/campaign-actions";
import { Pencil } from "lucide-react";
import { getStatusColor, formatDate, formatDateTime } from "@/lib/utils";
import { computeTimeToOpen } from "@/lib/analytics/time-to-open";
import type { Campaign, Contact } from "@/lib/types";

export default async function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!campaign) {
    notFound();
  }

  const { data: sends } = await supabase
    .from("sends")
    .select(`
      *,
      contacts:contact_id(*)
    `)
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: false });

  const sendsList = sends || [];
  const total = sendsList.length;
  const sent = sendsList.filter((s) => !["pending", "failed"].includes(s.status)).length;
  const delivered = sendsList.filter((s) => ["delivered", "opened", "clicked", "replied"].includes(s.status)).length;
  const opened = sendsList.filter((s) => ["opened", "clicked", "replied"].includes(s.status)).length;
  const clicked = sendsList.filter((s) => ["clicked"].includes(s.status)).length;
  const bounced = sendsList.filter((s) => s.status === "bounced").length;

  // Time to open
  const timeToOpen = computeTimeToOpen(sendsList as any);

  // A/B stats
  const hasAB = !!(campaign as Campaign).subject_b;
  const variantA = sendsList.filter((s) => s.variant === "A" || !s.variant);
  const variantB = sendsList.filter((s) => s.variant === "B");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">{(campaign as Campaign).name}</h1>
          <Badge
            variant="secondary"
            className={getStatusColor((campaign as Campaign).status)}
          >
            {(campaign as Campaign).status === "cancelled" ? "paused" : (campaign as Campaign).status}
          </Badge>
        </div>
        <div className="flex gap-2">
          {["draft", "scheduled"].includes((campaign as Campaign).status) && (
            <Link href={`/campaigns/${params.id}/edit`}>
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </Link>
          )}
          <CampaignActions
            campaignId={params.id}
            status={(campaign as Campaign).status}
            campaignName={(campaign as Campaign).name}
            variant="buttons"
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Subject{hasAB ? " A" : ""}:</span>{" "}
            {(campaign as Campaign).subject}
          </div>
          {hasAB && (
            <div>
              <span className="text-muted-foreground">Subject B:</span>{" "}
              {(campaign as Campaign).subject_b}
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Created:</span>{" "}
            {formatDate((campaign as Campaign).created_at)}
          </div>
          {(campaign as Campaign).sent_at && (
            <div>
              <span className="text-muted-foreground">Sent:</span>{" "}
              {formatDateTime((campaign as Campaign).sent_at!)}
            </div>
          )}
          <div className="whitespace-pre-wrap mt-4 p-4 bg-muted rounded-md text-sm">
            {(campaign as Campaign).body}
          </div>
        </CardContent>
      </Card>

      <CampaignStats
        total={total}
        sent={sent}
        delivered={delivered}
        opened={opened}
        clicked={clicked}
        bounced={bounced}
      />

      {/* A/B Comparison */}
      {hasAB && (
        <ABComparison
          subjectA={(campaign as Campaign).subject}
          subjectB={(campaign as Campaign).subject_b!}
          statsA={{
            total: variantA.length,
            opened: variantA.filter((s) => ["opened", "clicked", "replied"].includes(s.status)).length,
            clicked: variantA.filter((s) => s.status === "clicked").length,
          }}
          statsB={{
            total: variantB.length,
            opened: variantB.filter((s) => ["opened", "clicked", "replied"].includes(s.status)).length,
            clicked: variantB.filter((s) => s.status === "clicked").length,
          }}
        />
      )}

      {/* Time to Open */}
      {timeToOpen.totalOpens > 0 && <TimeToOpenCard {...timeToOpen} />}

      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  {hasAB && <TableHead>Variant</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead>Opened At</TableHead>
                  <TableHead>Clicked At</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sendsList.map((send: any) => {
                  const contact = send.contacts as Contact;
                  return (
                    <TableRow key={send.id}>
                      <TableCell className="font-medium">
                        {[contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell>{contact?.email}</TableCell>
                      {hasAB && (
                        <TableCell>
                          <Badge variant="outline">{send.variant || "A"}</Badge>
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={getStatusColor(send.status)}
                        >
                          {send.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {send.sent_at ? formatDateTime(send.sent_at) : "—"}
                      </TableCell>
                      <TableCell>
                        {send.opened_at ? formatDateTime(send.opened_at) : "—"}
                      </TableCell>
                      <TableCell>
                        {send.clicked_at ? formatDateTime(send.clicked_at) : "—"}
                      </TableCell>
                      <TableCell>
                        <MarkRepliedButton sendId={send.id} currentStatus={send.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
