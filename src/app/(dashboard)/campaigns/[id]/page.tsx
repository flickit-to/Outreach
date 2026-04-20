import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CampaignStats } from "@/components/campaigns/campaign-stats";
import { ABComparison } from "@/components/campaigns/ab-comparison";
import { CampaignRecipientsTable } from "@/components/campaigns/campaign-recipients-table";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pencil, Clock, Users, BarChart3, Send, ArrowLeft, GitBranch } from "lucide-react";
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
    .select(`*, contacts:contact_id(*), sender:sender_email_id(id, email, name)`)
    .eq("campaign_id", params.id)
    .order("sent_at", { ascending: false });

  // Sender emails are extracted from sends data inside the client component

  // Parent campaign info (if this is a sub-campaign)
  let parentCampaign: any = null;
  if ((campaign as Campaign).parent_campaign_id) {
    const { data: parent } = await supabase
      .from("campaigns")
      .select("id, name")
      .eq("id", (campaign as Campaign).parent_campaign_id!)
      .single();
    parentCampaign = parent;
  }

  // Sub-campaigns (if this is a parent)
  const { data: subCampaigns } = await supabase
    .from("campaigns")
    .select("id, name, status, trigger_engagement, sent_at")
    .eq("parent_campaign_id", params.id)
    .order("created_at");

  const isMainCampaign = !(campaign as Campaign).parent_campaign_id;

  // Total campaign contacts (including not-yet-sent)
  const { count: totalCampaignContacts } = await supabase
    .from("campaign_contacts")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", params.id);

  const sendsList = sends || [];

  // Counts for the Create Follow-up dialog (only for main campaigns)
  // openedCount used for checking if follow-up button should show
  const hasEngagement = sendsList.some((s) => ["opened", "clicked", "replied"].includes(s.status));
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
          {isMainCampaign && (totalSent > 0 || hasEngagement) && (
            <Link href={`/campaigns/new?parent=${params.id}&name=${encodeURIComponent((campaign as Campaign).name + " - Follow-up")}`}>
              <Button variant="outline" size="sm">
                <GitBranch className="h-4 w-4 mr-2" />
                Create Follow-up
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

      {/* Parent campaign link (for sub-campaigns) */}
      {parentCampaign && (
        <Card className="bg-blue-50/50 border-blue-200">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <ArrowLeft className="h-4 w-4 text-blue-700" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Follow-up to</p>
              <Link href={`/campaigns/${parentCampaign.id}`} className="text-sm font-medium text-blue-900 hover:underline">
                {parentCampaign.name}
              </Link>
            </div>
            {(campaign as Campaign).trigger_engagement && (
              <Badge variant="outline">
                Triggered by: {(campaign as Campaign).trigger_engagement?.replace("_", " ")}
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sub-campaigns funnel (for main campaigns with sub-campaigns) */}
      {isMainCampaign && subCampaigns && subCampaigns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch className="h-4 w-4" />
              Follow-up Sequence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {subCampaigns.map((sub: any) => (
              <Link key={sub.id} href={`/campaigns/${sub.id}`} className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[10px]">
                    {sub.trigger_engagement?.replace("_", " ")}
                  </Badge>
                  <span className="text-sm font-medium">{sub.name}</span>
                </div>
                <Badge variant="secondary" className={getStatusColor(sub.status)}>
                  {sub.status === "cancelled" ? "paused" : sub.status}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Message (compact, always visible) */}
      <Card>
        <CardContent className="pt-6 space-y-2 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <div>
              <span className="text-muted-foreground">Subject{hasAB ? " A" : ""}:</span>{" "}
              <span className="font-medium">{(campaign as Campaign).subject}</span>
            </div>
            {hasAB && (
              <div>
                <span className="text-muted-foreground">Subject B:</span>{" "}
                <span className="font-medium">{(campaign as Campaign).subject_b}</span>
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
          </div>
          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">View email body</summary>
            <div className="whitespace-pre-wrap mt-2 p-4 bg-muted rounded-md text-sm">
              {(campaign as Campaign).body}
            </div>
          </details>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="stats" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="stats" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Stats
          </TabsTrigger>
          <TabsTrigger value="recipients" className="gap-2">
            <Send className="h-4 w-4" />
            Recipients ({sendsList.length})
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-2">
            <Users className="h-4 w-4" />
            Pending ({pendingContacts.length})
          </TabsTrigger>
        </TabsList>

        {/* STATS TAB */}
        <TabsContent value="stats" className="space-y-6 mt-6">
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

          {timeToOpen.totalOpens > 0 && <TimeToOpenCard {...timeToOpen} />}
        </TabsContent>

        {/* RECIPIENTS TAB */}
        <TabsContent value="recipients" className="mt-6">
          {sendsList.length > 0 ? (
            <CampaignRecipientsTable sends={sendsList as any} hasAB={hasAB} />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No recipients sent yet. The campaign will start sending at the scheduled time.
            </div>
          )}
        </TabsContent>

        {/* PENDING TAB */}
        <TabsContent value="pending" className="mt-6">
          {pendingContacts.length > 0 ? (
            <>
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
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              All contacts have been sent. Campaign complete!
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
