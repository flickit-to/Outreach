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

  if (campError || !campaign) throw new Error("Campaign not found");
  if (!["scheduled", "draft"].includes(campaign.status))
    throw new Error(`Campaign status is ${campaign.status}, cannot send`);

  // Fetch settings
  const { data: settings } = await supabaseAdmin
    .from("settings")
    .select("*")
    .eq("user_id", campaign.user_id)
    .single();

  if (!settings?.resend_api_key)
    throw new Error("Resend API key not configured in Settings.");

  // Fetch sender emails
  const { data: senderEmailsRaw } = await supabaseAdmin
    .from("sender_emails")
    .select("*")
    .eq("user_id", campaign.user_id)
    .order("created_at", { ascending: true });

  const allSenders: SenderEmail[] = (senderEmailsRaw as SenderEmail[]) || [];

  // If campaign has a specific sender, only use that one
  let activeSenders = allSenders;
  if (campaign.from_email_id) {
    const specific = allSenders.find((s) => s.id === campaign.from_email_id);
    if (specific) activeSenders = [specific];
  }

  // Fallback: no sender emails at all → use default from settings
  if (activeSenders.length === 0 && settings.from_email) {
    // Create a virtual sender for the default
    activeSenders = [{
      id: "default",
      user_id: campaign.user_id,
      email: settings.from_email,
      name: settings.from_name || "Outreach",
      daily_limit: settings.daily_send_limit || 20,
      created_at: "",
    }];
  }

  if (activeSenders.length === 0)
    throw new Error("No sender emails configured. Add sender emails in Settings.");

  // Fetch campaign contacts
  // For SUB-CAMPAIGNS: resolve dynamically from parent's engagement
  // For MAIN CAMPAIGNS: use static campaign_contacts list
  let campaignContactsRaw: any[] = [];

  if (campaign.parent_campaign_id && campaign.trigger_engagement) {
    // Sub-campaign: query parent's sends matching the trigger
    const triggerStatuses: string[] = [];
    if (campaign.trigger_engagement === "opened") {
      triggerStatuses.push("opened", "clicked", "replied");
    } else if (campaign.trigger_engagement === "clicked") {
      triggerStatuses.push("clicked");
    } else if (campaign.trigger_engagement === "opened_or_clicked") {
      triggerStatuses.push("opened", "clicked", "replied");
    }

    const { data: triggeredSends } = await supabaseAdmin
      .from("sends")
      .select("contact_id, contacts:contact_id(*)")
      .eq("campaign_id", campaign.parent_campaign_id)
      .in("status", triggerStatuses);

    // Deduplicate by contact_id
    const seen = new Set<string>();
    campaignContactsRaw = (triggeredSends || []).filter((s: any) => {
      if (!s.contacts) return false;
      // Skip contacts who replied or moved to higher stages
      if (["replied", "meeting_booked", "closed_won", "closed_lost"].includes(s.contacts.lead_stage)) return false;
      if (seen.has(s.contact_id)) return false;
      seen.add(s.contact_id);
      return true;
    });

    // Sync to campaign_contacts table for record-keeping
    for (const cc of campaignContactsRaw) {
      await supabaseAdmin
        .from("campaign_contacts")
        .upsert({ campaign_id: campaignId, contact_id: cc.contact_id }, { onConflict: "campaign_id,contact_id" });
    }
  } else {
    // Main campaign: use the static list via campaign_contacts
    const { data: ccData } = await supabaseAdmin
      .from("campaign_contacts")
      .select("contact_id, contacts:contact_id(*)")
      .eq("campaign_id", campaignId);
    campaignContactsRaw = ccData || [];
  }

  if (!campaignContactsRaw || campaignContactsRaw.length === 0)
    throw new Error("No eligible contacts in this campaign");

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
    await supabaseAdmin
      .from("campaigns")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", campaignId);
    return { sent: 0, failed: 0, deferred: 0 };
  }

  // ===== Build per-sender capacity map =====
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const senderCapacity = new Map<string, { sender: SenderEmail; remaining: number }>();

  for (const sender of activeSenders) {
    const { count } = await supabaseAdmin
      .from("sends")
      .select("*", { count: "exact", head: true })
      .eq("sender_email_id", sender.id)
      .gte("sent_at", twentyFourHoursAgo)
      .neq("status", "failed");

    const limit = sender.daily_limit || 20;
    const remaining = Math.max(0, limit - (count || 0));
    senderCapacity.set(sender.id, { sender, remaining });
  }

  // Count assigned contacts per sender (for load balancing new assignments)
  const { data: assignedCounts } = await supabaseAdmin
    .from("contacts")
    .select("assigned_sender_id")
    .eq("user_id", campaign.user_id)
    .not("assigned_sender_id", "is", null);

  const assignedPerSender = new Map<string, number>();
  for (const c of assignedCounts || []) {
    const sid = (c as any).assigned_sender_id;
    assignedPerSender.set(sid, (assignedPerSender.get(sid) || 0) + 1);
  }

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

    // ===== Pick sender (sticky or load-balanced) =====
    let chosenSender: SenderEmail | null = null;

    // 1. Check if contact has a sticky sender assignment
    if (contact.assigned_sender_id) {
      const cap = senderCapacity.get(contact.assigned_sender_id);
      if (cap && cap.remaining > 0) {
        chosenSender = cap.sender;
      }
      // If assigned sender has no capacity → defer this contact
      if (!chosenSender) {
        deferred++;
        continue;
      }
    }

    // 2. No assignment → pick sender with most remaining capacity
    if (!chosenSender) {
      let bestSenderId: string | null = null;
      let bestRemaining = 0;

      senderCapacity.forEach((cap, sid) => {
        if (cap.remaining > bestRemaining) {
          bestRemaining = cap.remaining;
          bestSenderId = sid;
        } else if (cap.remaining === bestRemaining && bestSenderId) {
          const countA = assignedPerSender.get(bestSenderId) || 0;
          const countB = assignedPerSender.get(sid) || 0;
          if (countB < countA) bestSenderId = sid;
        }
      });

      if (!bestSenderId || bestRemaining <= 0) {
        deferred++;
        continue;
      }

      chosenSender = senderCapacity.get(bestSenderId)!.sender;

      // Assign this sender to the contact (sticky for future)
      if (chosenSender.id !== "default") {
        await supabaseAdmin
          .from("contacts")
          .update({ assigned_sender_id: chosenSender.id })
          .eq("id", contact.id);
        assignedPerSender.set(chosenSender.id, (assignedPerSender.get(chosenSender.id) || 0) + 1);
      }
    }

    // ===== Create send record =====
    const hasAB = !!campaign.subject_b;
    const splitPoint = Math.ceil(campaignContacts.length / 2);
    const variant = hasAB ? (i < splitPoint ? "A" : "B") : "A";

    const { data: sendRecord, error: sendError } = await supabaseAdmin
      .from("sends")
      .insert({
        campaign_id: campaignId,
        contact_id: contact.id,
        sender_email_id: chosenSender.id !== "default" ? chosenSender.id : null,
        from_email_address: chosenSender.email,
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

      const { data: emailData, error: emailError } = await resend.emails.send({
        from: `${chosenSender.name} <${chosenSender.email}>`,
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

      await supabaseAdmin
        .from("sends")
        .update({
          resend_id: emailData?.id || null,
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", sendRecord.id);

      await supabaseAdmin.from("events").insert({
        send_id: sendRecord.id,
        type: "sent",
      });

      await supabaseAdmin.rpc("recalculate_contact_status", {
        p_contact_id: contact.id,
      });

      // Auto-update lead stage
      const { count: previousSends } = await supabaseAdmin
        .from("sends")
        .select("*", { count: "exact", head: true })
        .eq("contact_id", contact.id)
        .neq("id", sendRecord.id)
        .in("status", ["sent", "delivered", "opened", "clicked"]);

      if ((previousSends || 0) > 0) {
        await supabaseAdmin
          .from("contacts")
          .update({ lead_stage: "follow_up_sent" })
          .eq("id", contact.id)
          .in("lead_stage", ["new_lead", "email_sent", "opened", "follow_up_needed"]);
      } else {
        await supabaseAdmin
          .from("contacts")
          .update({ lead_stage: "email_sent" })
          .eq("id", contact.id)
          .eq("lead_stage", "new_lead");
      }

      // Decrement sender capacity
      const cap = senderCapacity.get(chosenSender.id);
      if (cap) cap.remaining--;

      sent++;
    } catch {
      await supabaseAdmin
        .from("sends")
        .update({ status: "failed" })
        .eq("id", sendRecord.id);
      failed++;
    }
  }

  // Roll forward or complete
  if (deferred > 0) {
    const sendDays: number[] = campaign.send_days || [1, 2, 3, 4, 5];
    const current = new Date(campaign.scheduled_at);
    const next = new Date(current);
    const dayMapLookup: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

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
      .update({ status: "scheduled", scheduled_at: next.toISOString() })
      .eq("id", campaignId);
  } else {
    await supabaseAdmin
      .from("campaigns")
      .update({ status: "sent", sent_at: sent > 0 ? new Date().toISOString() : campaign.sent_at })
      .eq("id", campaignId);
  }

  return { sent, failed, deferred };
}
