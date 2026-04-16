import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CampaignStats } from "@/components/campaigns/campaign-stats";
import { ABComparison } from "@/components/campaigns/ab-comparison";
import { MarkRepliedButton } from "@/components/campaigns/mark-replied-button";
import { TimeToOpenCard } from "@/components/campaigns/time-to-open-card";
import { CampaignActions } from "@/components/campaigns/campaign-actions";
import { CampaignCountdown } from "@/components/campaigns/campaign-countdown";
import { ClientDateTime } from "@/components/ui/client-date-time";
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
import { Pencil, Clock, Users } from "lucide-react";
import { getStatusColor, formatDate } from "@/lib/utils";
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

  // All sends for this campaign
  const { data: sends } = await supabase
    .from("sends")
    .select(`*, contacts:contact_id(*)`)
    .eq("campaign_id", params.id)
    .order("sent_at", { ascending: false });

  // Total campaign contacts (including not-yet-sent)
  const { count: totalCampaignContacts } = await supabase
    .from("campaign_contacts")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", params.id);

  const sendsList = sends || [];
  const totalRecipients = totalCampaignContacts || 0;
  const totalSent = sendsList.filter((s) => !["pending", "failed"].includes(s.status)).length;
  const totalDelivered = sendsList.filter((s) => ["delivered", "opened", "clicked", "replied"].includes(s.status)).length;
  const totalOpened = sendsList.filter((s) => ["opened", "clicked", "replied"].includes(s.status)).length;
  const totalClicked = sendsList.filter((s) => s.status === "clicked").length;
  const totalBounced = sendsList.filter((s) => s.status === "bounced").length;
  const remaining = totalRecipients - totalSent;

  // Time to open
  const timeToOpen = computeTimeToOpen(sendsList as any);

  // A/B stats
  const hasAB = !!(campaign as Campaign).subject_b;
  const variantA = sendsList.filter((s) => s.variant === "A" || !s.variant);
  const variantB = sendsList.filter((s) => s.variant === "B");

  // Group sends by day for day-by-day breakdown
  // Use Australia/Sydney timezone for grouping (since user is in Sydney)
  // TODO: make this configurable via user settings
  const userTimezone = "Australia/Sydney";
  const sendsByDay = new Map<string, typeof sendsList>();
  for (const send of sendsList) {
    if (!send.sent_at) continue;
    const day = new Date(send.sent_at).toLocaleDateString("en-CA", { timeZone: userTimezone });
    if (!sendsByDay.has(day)) sendsByDay.set(day, []);
    sendsByDay.get(day)!.push(send);
  }
  const dayBreakdown = Array.from(sendsByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, daySends], idx) => ({
      date,
      dayNum: idx + 1,
      sent: daySends.filter((s: any) => !["pending", "failed"].includes(s.status)).length,
      opened: daySends.filter((s: any) => ["opened", "clicked", "replied"].includes(s.status)).length,
      clicked: daySends.filter((s: any) => s.status === "clicked").length,
      bounced: daySends.filter((s: any) => s.status === "bounced").length,
    }));

  // Get contacts not yet sent (for "pending" section)
  const sentContactIds = new Set(sendsList.map((s) => s.contact_id));
  const { data: allCampaignContacts } = await supabase
    .from("campaign_contacts")
    .select("contact_id, contacts:contact_id(*)")
    .eq("campaign_id", params.id);
  const pendingContacts = (allCampaignContacts || [])
    .filter((cc: any) => !sentContactIds.has(cc.contact_id))
    .map((cc: any) => cc.contacts as Contact)
    .filter(Boolean);

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
          {(campaign as Campaign).status === "scheduled" && (campaign as Campaign).scheduled_at && (
            <CampaignCountdown scheduledAt={(campaign as Campaign).scheduled_at!} />
          )}
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

      {/* Campaign Info */}
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
              <ClientDateTime value={(campaign as Campaign).sent_at!} />
            </div>
          )}
          <div className="whitespace-pre-wrap mt-4 p-4 bg-muted rounded-md text-sm">
            {(campaign as Campaign).body}
          </div>
        </CardContent>
      </Card>

      {/* Overall Stats (all batches combined) */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-semibold">Overall Stats</h2>
          {remaining > 0 && (
            <span className="text-sm text-muted-foreground">
              ({totalSent} of {totalRecipients} sent &middot; {remaining} remaining)
            </span>
          )}
        </div>
        <CampaignStats
          total={totalRecipients}
          sent={totalSent}
          delivered={totalDelivered}
          opened={totalOpened}
          clicked={totalClicked}
          bounced={totalBounced}
        />
      </div>

      {/* Day-by-Day Breakdown */}
      {dayBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Day-by-Day Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Opened</TableHead>
                    <TableHead className="text-right">Clicked</TableHead>
                    <TableHead className="text-right">Bounced</TableHead>
                    <TableHead className="text-right">Open Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dayBreakdown.map((day) => (
                    <TableRow key={day.date}>
                      <TableCell className="font-medium">Day {day.dayNum}</TableCell>
                      <TableCell>{formatDate(day.date)}</TableCell>
                      <TableCell className="text-right">{day.sent}</TableCell>
                      <TableCell className="text-right">{day.opened}</TableCell>
                      <TableCell className="text-right">{day.clicked}</TableCell>
                      <TableCell className="text-right">{day.bounced}</TableCell>
                      <TableCell className="text-right">
                        {day.sent > 0 ? Math.round((day.opened / day.sent) * 100) : 0}%
                      </TableCell>
                    </TableRow>
                  ))}
                  {remaining > 0 && (
                    <TableRow>
                      <TableCell className="font-medium text-muted-foreground">Upcoming</TableCell>
                      <TableCell className="text-muted-foreground">
                        <ClientDateTime value={(campaign as Campaign).scheduled_at} />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{remaining}</TableCell>
                      <TableCell colSpan={4} className="text-muted-foreground">—</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Sent Recipients Table */}
      {sendsList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sent Recipients ({sendsList.length})</CardTitle>
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
                        <TableCell className="font-medium privacy-blur">
                          {[contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "—"}
                        </TableCell>
                        <TableCell className="privacy-blur">{contact?.email}</TableCell>
                        {hasAB && (
                          <TableCell>
                            <Badge variant="outline">{send.variant || "A"}</Badge>
                          </TableCell>
                        )}
                        <TableCell>
                          <Badge variant="secondary" className={getStatusColor(send.status)}>
                            {send.status}
                          </Badge>
                        </TableCell>
                        <TableCell><ClientDateTime value={send.sent_at} /></TableCell>
                        <TableCell><ClientDateTime value={send.opened_at} /></TableCell>
                        <TableCell><ClientDateTime value={send.clicked_at} /></TableCell>
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
      )}

      {/* Pending Recipients (not yet sent) */}
      {pendingContacts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Pending Recipients ({pendingContacts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              These contacts haven&apos;t been sent to yet. They&apos;ll be sent in upcoming batches.
            </p>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingContacts.slice(0, 50).map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium privacy-blur">
                        {[contact.first_name, contact.last_name].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell className="privacy-blur">{contact.email}</TableCell>
                      <TableCell className="privacy-blur">{contact.company || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {pendingContacts.length > 50 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        +{pendingContacts.length - 50} more
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
