import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient } from "./client";
import { processEmailBody, processSubject } from "./templates";
import type { Contact, SenderEmail } from "@/lib/types";

interface SendResult {
  sent: number;
  failed: number;
  deferred: number;
}

export async function sendCampaign(
  campaignId: string,
  supabaseAdmin: SupabaseClient
): Promise<SendResult> {
  // Fetch campaign
  const { data: campaign, error: campError } = await supabaseAdmin
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (campError || !campaign) {
    throw new Error("Campaign not found");
  }

  if (!["scheduled", "draft"].includes(campaign.status)) {
    throw new Error(`Campaign status is ${campaign.status}, cannot send`);
  }

  // Fetch settings
  const { data: settings } = await supabaseAdmin
    .from("settings")
    .select("*")
    .eq("user_id", campaign.user_id)
    .single();

  if (!settings?.resend_api_key) {
    throw new Error("Resend API key not configured in Settings.");
  }

  // Fetch sender emails
  const { data: senderEmails } = await supabaseAdmin
    .from("sender_emails")
    .select("*")
    .eq("user_id", campaign.user_id)
    .order("created_at", { ascending: true });

  // Determine sender strategy
  let specificSender: SenderEmail | null = null;
  const allSenders: SenderEmail[] = (senderEmails as SenderEmail[]) || [];

  if (campaign.from_email_id) {
    // Specific sender selected
    specificSender = allSenders.find((s) => s.id === campaign.from_email_id) || null;
    if (!specificSender) {
      throw new Error("Selected sender email not found.");
    }
  } else if (allSenders.length === 0) {
    // No sender emails configured, use default from settings
    if (!settings.from_email) {
      throw new Error("No sender emails configured. Add sender emails in Settings or set a default from email.");
    }
  }

  // Fetch campaign contacts
  const { data: campaignContactsRaw } = await supabaseAdmin
    .from("campaign_contacts")
    .select("contact_id, contacts:contact_id(*)")
    .eq("campaign_id", campaignId);

  if (!campaignContactsRaw || campaignContactsRaw.length === 0) {
    throw new Error("No contacts in this campaign");
  }

  // Filter out contacts that already have a non-failed send for this campaign
  // (prevents re-sending on subsequent days)
  const { data: existingSends } = await supabaseAdmin
    .from("sends")
    .select("contact_id")
    .eq("campaign_id", campaignId)
    .neq("status", "failed");
  const alreadySent = new Set((existingSends || []).map((s: any) => s.contact_id));

  const campaignContacts = campaignContactsRaw.filter(
    (cc: any) => !alreadySent.has(cc.contact_id)
  );

  if (campaignContacts.length === 0) {
    // All contacts already sent — mark campaign complete
    await supabaseAdmin
      .from("campaigns")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", campaignId);
    return { sent: 0, failed: 0, deferred: 0 };
  }

  // Check daily send limit
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000
  ).toISOString();

  const { count: sentToday } = await supabaseAdmin
    .from("sends")
    .select("*", { count: "exact", head: true })
    .gte("sent_at", twentyFourHoursAgo)
    .neq("status", "failed");

  const dailyLimit = settings.daily_send_limit || 20;
  const remaining = Math.max(0, dailyLimit - (sentToday || 0));

  // Update campaign status
  await supabaseAdmin
    .from("campaigns")
    .update({ status: "sending" })
    .eq("id", campaignId);

  const resend = getResendClient(settings.resend_api_key);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  let sent = 0;
  let failed = 0;
  let deferred = 0;

  for (let i = 0; i < campaignContacts.length; i++) {
    const cc = campaignContacts[i] as any;
    const contact = cc.contacts as Contact;

    if (!contact) continue;

    // Check daily limit
    if (sent >= remaining) {
      deferred++;
      continue;
    }

    // Pick sender: specific, auto-rotate, or default
    let fromName: string;
    let fromEmail: string;

    if (specificSender) {
      // Use the specific sender selected for this campaign
      fromName = specificSender.name;
      fromEmail = specificSender.email;
    } else if (allSenders.length > 0) {
      // Auto-rotate: round-robin across sender emails
      const senderIndex = i % allSenders.length;
      fromName = allSenders[senderIndex].name;
      fromEmail = allSenders[senderIndex].email;
    } else {
      // Fallback to default settings
      fromName = settings.from_name || "Outreach";
      fromEmail = settings.from_email;
    }

    // Determine A/B variant
    const hasAB = !!campaign.subject_b;
    const splitPoint = Math.ceil(campaignContacts.length / 2);
    const variant = hasAB ? (i < splitPoint ? "A" : "B") : "A";

    // Create send record
    const { data: sendRecord, error: sendError } = await supabaseAdmin
      .from("sends")
      .insert({
        campaign_id: campaignId,
        contact_id: contact.id,
        status: "pending",
        variant,
      })
      .select()
      .single();

    if (sendError || !sendRecord) {
      failed++;
      continue;
    }

    try {
      // Process email
      const html = processEmailBody(
        campaign.body,
        contact,
        sendRecord.id,
        appUrl,
        {
          html: settings.signature_html || null,
          imageUrl: settings.signature_image_url || null,
        }
      );
      const subjectText = variant === "B" && campaign.subject_b
        ? campaign.subject_b
        : campaign.subject;
      const subject = processSubject(subjectText, contact);

      // Send via Resend
      const { data: emailData, error: emailError } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [contact.email],
        subject,
        html,
      });

      if (emailError) {
        await supabaseAdmin
          .from("sends")
          .update({ status: "failed" })
          .eq("id", sendRecord.id);

        failed++;
        continue;
      }

      // Update send record
      await supabaseAdmin
        .from("sends")
        .update({
          resend_id: emailData?.id || null,
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", sendRecord.id);

      // Log sent event
      await supabaseAdmin.from("events").insert({
        send_id: sendRecord.id,
        type: "sent",
      });

      // Update contact status
      await supabaseAdmin.rpc("recalculate_contact_status", {
        p_contact_id: contact.id,
      });

      // Auto-update lead stage
      // Check if this is a follow-up (contact already had emails sent before)
      const { count: previousSends } = await supabaseAdmin
        .from("sends")
        .select("*", { count: "exact", head: true })
        .eq("contact_id", contact.id)
        .neq("id", sendRecord.id)
        .in("status", ["sent", "delivered", "opened", "clicked"]);

      if ((previousSends || 0) > 0) {
        // This is a follow-up email
        await supabaseAdmin
          .from("contacts")
          .update({ lead_stage: "follow_up_sent" })
          .eq("id", contact.id)
          .in("lead_stage", ["new_lead", "email_sent", "opened", "follow_up_needed"]);
      } else {
        // First email to this contact
        await supabaseAdmin
          .from("contacts")
          .update({ lead_stage: "email_sent" })
          .eq("id", contact.id)
          .eq("lead_stage", "new_lead");
      }

      sent++;
    } catch {
      await supabaseAdmin
        .from("sends")
        .update({ status: "failed" })
        .eq("id", sendRecord.id);

      failed++;
    }
  }

  // Update campaign status and roll forward scheduled_at if more contacts remain
  if (deferred > 0) {
    // Roll scheduled_at forward to the same time tomorrow (or next valid send day)
    // Use Australia/Sydney timezone for day-of-week check (matches user's send_days intent)
    const sendDays: number[] = campaign.send_days || [1, 2, 3, 4, 5];
    const current = new Date(campaign.scheduled_at);
    const next = new Date(current);

    const dayMapLookup: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

    // Add 1 day, then skip days not in send_days (max 7 iterations)
    for (let attempt = 0; attempt < 7; attempt++) {
      next.setDate(next.getDate() + 1);
      const sydDay = new Intl.DateTimeFormat("en-US", {
        timeZone: "Australia/Sydney",
        weekday: "short",
      }).format(next);
      const dayNum = dayMapLookup[sydDay] ?? next.getDay();
      if (sendDays.includes(dayNum)) break;
    }

    await supabaseAdmin
      .from("campaigns")
      .update({
        status: "scheduled",
        scheduled_at: next.toISOString(),
      })
      .eq("id", campaignId);
  } else {
    // All contacts processed
    await supabaseAdmin
      .from("campaigns")
      .update({
        status: "sent",
        sent_at: sent > 0 ? new Date().toISOString() : campaign.sent_at,
      })
      .eq("id", campaignId);
  }

  return { sent, failed, deferred };
}
