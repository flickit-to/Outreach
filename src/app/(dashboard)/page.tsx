import { createClient } from "@/lib/supabase/server";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { CampaignChart } from "@/components/dashboard/campaign-chart";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { BestTimesCard } from "@/components/dashboard/best-times-card";
import { TimeToOpenSummary } from "@/components/dashboard/time-to-open-summary";
import { DailyDigest } from "@/components/dashboard/daily-digest";
import { CompanyAnalyticsCard, type CompanyRow } from "@/components/dashboard/company-analytics-card";
import { SenderPerformanceCard, type SenderRow } from "@/components/dashboard/sender-performance-card";
import { getBestSendTimes } from "@/lib/analytics/best-time";
import { computeTimeToOpen } from "@/lib/analytics/time-to-open";

export default async function DashboardPage() {
  const supabase = createClient();

  // Total contacts
  const { count: totalContacts } = await supabase
    .from("contacts")
    .select("*", { count: "exact", head: true });

  // Active campaigns
  const { count: activeCampaigns } = await supabase
    .from("campaigns")
    .select("*", { count: "exact", head: true })
    .in("status", ["scheduled", "sending"]);

  // Send stats
  const { data: allSends } = await supabase
    .from("sends")
    .select("status, sent_at, opened_at, contact_id, sender_email_id, from_email_address");

  // Fetch sender emails for performance card
  const { data: dashboardSenderEmails } = await supabase
    .from("sender_emails")
    .select("id, email, name")
    .order("created_at");

  const totalSent = allSends?.filter((s) => !["pending", "failed"].includes(s.status)).length || 0;
  const totalDelivered = allSends?.filter((s) => ["delivered", "opened", "clicked", "replied"].includes(s.status)).length || 0;
  const totalOpened = allSends?.filter((s) => ["opened", "clicked", "replied"].includes(s.status)).length || 0;
  const totalClicked = allSends?.filter((s) => s.status === "clicked").length || 0;
  const totalBounced = allSends?.filter((s) => s.status === "bounced").length || 0;

  const openRate = totalDelivered > 0 ? Math.round((totalOpened / totalDelivered) * 100) : 0;
  const clickRate = totalDelivered > 0 ? Math.round((totalClicked / totalDelivered) * 100) : 0;
  const bounceRate = totalSent > 0 ? Math.round((totalBounced / totalSent) * 100) : 0;

  // Time to Open
  const timeToOpen = computeTimeToOpen((allSends as any) || []);
  const topBucket = timeToOpen.distribution.length > 0
    ? timeToOpen.distribution.reduce((max, b) => b.count > max.count ? b : max, timeToOpen.distribution[0])
    : null;

  // Best Time to Send
  const bestTimes = await getBestSendTimes(supabase);

  // Campaign chart data (last 10 campaigns that have been sent or are sending)
  const { data: recentCampaigns } = await supabase
    .from("campaigns")
    .select("id, name")
    .in("status", ["sent", "scheduled", "sending"])
    .order("created_at", { ascending: false })
    .limit(10);

  const chartData = [];
  if (recentCampaigns) {
    for (const campaign of recentCampaigns) {
      const { data: sends } = await supabase
        .from("sends")
        .select("status")
        .eq("campaign_id", campaign.id);

      chartData.push({
        name: campaign.name.length > 15 ? campaign.name.slice(0, 15) + "..." : campaign.name,
        sent: sends?.filter((s) => !["pending", "failed"].includes(s.status)).length || 0,
        opened: sends?.filter((s) => ["opened", "clicked", "replied"].includes(s.status)).length || 0,
        clicked: sends?.filter((s) => s.status === "clicked").length || 0,
        bounced: sends?.filter((s) => s.status === "bounced").length || 0,
      });
    }
  }

  // Recent activity (last 20 events)
  const { data: recentEvents } = await supabase
    .from("events")
    .select(`
      id,
      type,
      created_at,
      sends:send_id(
        contacts:contact_id(email, first_name, last_name),
        campaigns:campaign_id(name)
      )
    `)
    .order("created_at", { ascending: false })
    .limit(20);

  const activities = (recentEvents || []).map((event: any) => ({
    id: event.id,
    type: event.type,
    contact_email: event.sends?.contacts?.email || "",
    contact_name: [event.sends?.contacts?.first_name, event.sends?.contacts?.last_name].filter(Boolean).join(" ") || null,
    campaign_name: event.sends?.campaigns?.name || "",
    created_at: event.created_at,
  }));

  // === Daily Digest Data ===
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  // Opened today
  const { data: openEventsToday } = await supabase
    .from("events")
    .select("send_id, sends:send_id(contact_id, contacts:contact_id(id, first_name, last_name, email))")
    .eq("type", "opened")
    .gte("created_at", todayISO);

  const openedTodayMap = new Map<string, { contactId: string; name: string | null; email: string; count: number }>();
  for (const ev of openEventsToday || []) {
    const contact = (ev as any).sends?.contacts;
    if (!contact) continue;
    const existing = openedTodayMap.get(contact.id);
    if (existing) {
      existing.count++;
    } else {
      openedTodayMap.set(contact.id, { contactId: contact.id, name: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null, email: contact.email, count: 1 });
    }
  }

  // Clicked today
  const { data: clickEventsToday } = await supabase
    .from("events")
    .select("send_id, sends:send_id(contact_id, contacts:contact_id(id, first_name, last_name, email))")
    .eq("type", "clicked")
    .gte("created_at", todayISO);

  const clickedTodayMap = new Map<string, { contactId: string; name: string | null; email: string; count: number }>();
  for (const ev of clickEventsToday || []) {
    const contact = (ev as any).sends?.contacts;
    if (!contact) continue;
    const existing = clickedTodayMap.get(contact.id);
    if (existing) {
      existing.count++;
    } else {
      clickedTodayMap.set(contact.id, { contactId: contact.id, name: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null, email: contact.email, count: 1 });
    }
  }

  // Bounced today
  const { data: bouncedSendsToday } = await supabase
    .from("sends")
    .select("contact_id, contacts:contact_id(id, name, email)")
    .eq("status", "bounced")
    .gte("bounced_at", todayISO);

  const bouncedToday = (bouncedSendsToday || []).map((s: any) => ({
    contactId: s.contacts?.id || "",
    name: [s.contacts?.first_name, s.contacts?.last_name].filter(Boolean).join(" ") || null,
    email: s.contacts?.email || "",
  }));

  // Need follow-up: contacts with lead_stage follow_up_needed, or sent > 3 days ago with no open
  const { data: followUpContacts } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email")
    .eq("lead_stage", "follow_up_needed");

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: staleSends } = await supabase
    .from("sends")
    .select("contact_id, sent_at, contacts:contact_id(id, first_name, last_name, email, lead_stage)")
    .in("status", ["sent", "delivered"])
    .lte("sent_at", threeDaysAgo);

  const needFollowUp = [
    ...(followUpContacts || []).map((c: any) => ({
      contactId: c.id,
      name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
      email: c.email,
      daysSinceSend: 0,
    })),
  ];

  const seenContactIds = new Set(needFollowUp.map((c) => c.contactId));
  for (const send of staleSends || []) {
    const contact = (send as any).contacts;
    if (!contact || seenContactIds.has(contact.id)) continue;
    if (["replied", "meeting_booked", "closed_won", "closed_lost"].includes(contact.lead_stage)) continue;
    const daysSince = Math.floor((Date.now() - new Date(send.sent_at).getTime()) / (24 * 60 * 60 * 1000));
    needFollowUp.push({
      contactId: contact.id,
      name: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null,
      email: contact.email,
      daysSinceSend: daysSince,
    });
    seenContactIds.add(contact.id);
  }

  // Company analytics aggregation
  const { data: contactsForCompany } = await supabase
    .from("contacts")
    .select("id, company");

  const companyByContactId = new Map<string, string>();
  const companyRowsMap = new Map<string, CompanyRow>();
  for (const c of contactsForCompany || []) {
    const key = (c.company ?? "").trim();
    if (!key) continue;
    companyByContactId.set(c.id, key);
    if (!companyRowsMap.has(key)) {
      companyRowsMap.set(key, { company: key, contacts: 0, sent: 0, opened: 0, clicked: 0, openRate: 0, clickRate: 0 });
    }
    companyRowsMap.get(key)!.contacts++;
  }

  for (const s of allSends || []) {
    const company = companyByContactId.get((s as any).contact_id);
    if (!company) continue;
    const row = companyRowsMap.get(company)!;
    if (!["pending", "failed"].includes(s.status)) row.sent++;
    if (["opened", "clicked", "replied"].includes(s.status)) row.opened++;
    if (s.status === "clicked") row.clicked++;
  }

  const companyRows: CompanyRow[] = Array.from(companyRowsMap.values())
    .map((r) => ({
      ...r,
      openRate: r.sent > 0 ? Math.round((r.opened / r.sent) * 100) : 0,
      clickRate: r.sent > 0 ? Math.round((r.clicked / r.sent) * 100) : 0,
    }))
    .sort((a, b) => b.openRate - a.openRate || b.sent - a.sent)
    .slice(0, 10);

  const companiesTargeted = companyRowsMap.size;

  // Sender performance aggregation
  const senderMap = new Map<string, SenderRow>();
  const senderLookup = new Map((dashboardSenderEmails || []).map((s: any) => [s.id, s]));
  for (const s of allSends || []) {
    const sid = (s as any).sender_email_id || "default";
    const senderInfo = senderLookup.get(sid) || { email: (s as any).from_email_address || "unknown", name: (s as any).from_email_address || "Default" };
    if (!senderMap.has(sid)) {
      senderMap.set(sid, { email: (senderInfo as any).email, name: (senderInfo as any).name, sent: 0, opened: 0, clicked: 0, bounced: 0, openRate: 0, clickRate: 0, bounceRate: 0 });
    }
    const row = senderMap.get(sid)!;
    if (!["pending", "failed"].includes(s.status)) row.sent++;
    if (["opened", "clicked", "replied"].includes(s.status)) row.opened++;
    if (s.status === "clicked") row.clicked++;
    if (s.status === "bounced") row.bounced++;
  }
  const senderRows: SenderRow[] = Array.from(senderMap.values())
    .map((r) => ({
      ...r,
      openRate: r.sent > 0 ? Math.round((r.opened / r.sent) * 100) : 0,
      clickRate: r.sent > 0 ? Math.round((r.clicked / r.sent) * 100) : 0,
      bounceRate: r.sent > 0 ? Math.round((r.bounced / r.sent) * 100) : 0,
    }))
    .sort((a, b) => b.sent - a.sent);

  // Upcoming campaigns
  const { data: upcoming } = await supabase
    .from("campaigns")
    .select("id, name, scheduled_at")
    .eq("status", "scheduled")
    .gt("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(5);

  const upcomingCampaigns = (upcoming || []).map((c) => ({
    id: c.id,
    name: c.name,
    scheduledAt: c.scheduled_at,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <StatsCards
        totalContacts={totalContacts || 0}
        totalSent={totalSent}
        totalDelivered={totalDelivered}
        totalClicked={totalClicked}
        openRate={openRate}
        clickRate={clickRate}
        bounceRate={bounceRate}
        activeCampaigns={activeCampaigns || 0}
      />

      {/* Daily Digest */}
      <DailyDigest
        openedToday={Array.from(openedTodayMap.values())}
        clickedToday={Array.from(clickedTodayMap.values())}
        bouncedToday={bouncedToday}
        needFollowUp={needFollowUp}
        upcomingCampaigns={upcomingCampaigns}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CampaignChart data={chartData.reverse()} />
        <RecentActivity activities={activities} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BestTimesCard
          bestDay={bestTimes.bestDay}
          bestHour={bestTimes.bestHour}
          dailyCounts={bestTimes.dailyCounts}
          totalOpens={bestTimes.totalOpens}
        />
        <TimeToOpenSummary
          avgMinutes={timeToOpen.avgMinutes}
          topBucket={topBucket?.label || "N/A"}
          topBucketPct={topBucket && timeToOpen.totalOpens > 0 ? Math.round((topBucket.count / timeToOpen.totalOpens) * 100) : 0}
          totalOpens={timeToOpen.totalOpens}
        />
      </div>

      <SenderPerformanceCard rows={senderRows} />

      <CompanyAnalyticsCard companiesTargeted={companiesTargeted} rows={companyRows} />
    </div>
  );
}
