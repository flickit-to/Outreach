import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContactForm } from "@/components/contacts/contact-form";
import { ContactStatusBadge } from "@/components/contacts/contact-status-badge";
import { LeadStageBadge } from "@/components/contacts/lead-stage-badge";
import { EmailHistory, type EmailHistoryItem } from "@/components/contacts/email-history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Contact } from "@/lib/types";

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

  // Fetch sends + events + the source (sequence step or campaign) so we can
  // show subject, body, and from-address per email.
  const { data: sends } = await supabase
    .from("sends")
    .select(
      `*,
       events(*),
       campaigns:campaign_id(name, subject, body),
       sequence_step:sequence_step_id(subject, body, sequences:sequence_id(name))`,
    )
    .eq("contact_id", params.id)
    .order("created_at", { ascending: false });

  const historyItems: EmailHistoryItem[] = (sends || []).map((send: any) => {
    const step = send.sequence_step;
    const campaign = send.campaigns;
    let source: EmailHistoryItem["source"];
    if (step) {
      source = { kind: "sequence", name: step.sequences?.name ?? null };
    } else if (campaign) {
      source = { kind: "campaign", name: campaign.name ?? null };
    } else {
      source = { kind: "unknown" };
    }
    const subject = step?.subject ?? campaign?.subject ?? null;
    const body = step?.body ?? campaign?.body ?? null;
    const events = (send.events || [])
      .slice()
      .sort(
        (a: any, b: any) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    return {
      id: send.id,
      subject,
      body,
      from_email_address: send.from_email_address,
      status: send.status,
      sent_at: send.sent_at,
      delivered_at: send.delivered_at,
      opened_at: send.opened_at,
      clicked_at: send.clicked_at,
      replied_at: send.replied_at,
      bounced_at: send.bounced_at,
      source,
      events,
    };
  });

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
        <h1 className="text-2xl font-bold privacy-blur">
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
              <span className="privacy-blur">{(contact as Contact).first_name || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Last Name:</span>{" "}
              <span className="privacy-blur">{(contact as Contact).last_name || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Email:</span>{" "}
              <span className="privacy-blur">{(contact as Contact).email}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Company:</span>{" "}
              <span className="privacy-blur">{(contact as Contact).company || "—"}</span>
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

      {/* Email history */}
      <Card>
        <CardHeader>
          <CardTitle>Email history ({historyItems.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <EmailHistory items={historyItems} />
        </CardContent>
      </Card>
    </div>
  );
}
