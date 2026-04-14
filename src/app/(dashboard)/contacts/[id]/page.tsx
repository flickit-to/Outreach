import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContactForm } from "@/components/contacts/contact-form";
import { ContactStatusBadge } from "@/components/contacts/contact-status-badge";
import { LeadStageBadge } from "@/components/contacts/lead-stage-badge";
import { ActivityTimeline } from "@/components/contacts/activity-timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Contact, ContactActivity } from "@/lib/types";

export default async function ContactDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!contact) {
    notFound();
  }

  const { data: allTags } = await supabase
    .from("tags")
    .select("*")
    .eq("user_id", user!.id)
    .order("name");

  // Fetch activity: events with send and campaign info
  const { data: sends } = await supabase
    .from("sends")
    .select(`
      *,
      events(*),
      campaigns:campaign_id(*)
    `)
    .eq("contact_id", params.id)
    .order("created_at", { ascending: false });

  // Flatten events into timeline
  const activities: ContactActivity[] = [];
  if (sends) {
    for (const send of sends) {
      const events = (send as any).events || [];
      const campaign = (send as any).campaigns;
      for (const event of events) {
        activities.push({
          event,
          send: {
            id: send.id,
            campaign_id: send.campaign_id,
            contact_id: send.contact_id,
            resend_id: send.resend_id,
            status: send.status,
            sent_at: send.sent_at,
            delivered_at: send.delivered_at,
            opened_at: send.opened_at,
            clicked_at: send.clicked_at,
            bounced_at: send.bounced_at,
            replied_at: send.replied_at,
            variant: send.variant || "A",
            created_at: send.created_at,
          },
          campaign,
        });
      }
    }
  }
  activities.sort(
    (a, b) =>
      new Date(b.event.created_at).getTime() -
      new Date(a.event.created_at).getTime()
  );

  const totalSends = sends?.length || 0;
  const openCount = sends?.filter(
    (s) => s.opened_at || s.status === "opened" || s.status === "clicked"
  ).length || 0;
  const clickCount = sends?.filter(
    (s) => s.clicked_at || s.status === "clicked"
  ).length || 0;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">
          {[(contact as Contact).first_name, (contact as Contact).last_name].filter(Boolean).join(" ") || (contact as Contact).email}
        </h1>
        <LeadStageBadge
          contactId={(contact as Contact).id}
          stage={(contact as Contact).lead_stage}
        />
        <ContactStatusBadge status={(contact as Contact).status} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalSends}</div>
            <p className="text-sm text-muted-foreground">Emails Sent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{openCount}</div>
            <p className="text-sm text-muted-foreground">Opens</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{clickCount}</div>
            <p className="text-sm text-muted-foreground">Clicks</p>
          </CardContent>
        </Card>
      </div>

      {/* Contact Info */}
      <Card>
        <CardHeader>
          <CardTitle>Contact Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">First Name:</span>{" "}
              {(contact as Contact).first_name || "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Last Name:</span>{" "}
              {(contact as Contact).last_name || "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Email:</span>{" "}
              {(contact as Contact).email}
            </div>
            <div>
              <span className="text-muted-foreground">Company:</span>{" "}
              {(contact as Contact).company || "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Role:</span>{" "}
              {(contact as Contact).role || "—"}
            </div>
          </div>
          {(contact as Contact).tags.length > 0 && (
            <div className="flex gap-1">
              {(contact as Contact).tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          {(contact as Contact).notes && (
            <div className="text-sm">
              <span className="text-muted-foreground">Notes:</span>{" "}
              {(contact as Contact).notes}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Form */}
      <ContactForm contact={contact as Contact} userId={user!.id} allTags={(allTags as any) || []} />

      {/* Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityTimeline activities={activities} />
        </CardContent>
      </Card>
    </div>
  );
}
