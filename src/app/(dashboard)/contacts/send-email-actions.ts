"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshAccessToken, sendMail } from "@/lib/microsoft/graph";
import { buildTrackedHtml } from "@/lib/microsoft/compose";

export type SendEmailResult =
  | { ok: true; activityId: string; mailbox: string }
  | { ok: false; error: string };

export async function sendEmailFromOutlook(args: {
  contactId: string;
  subject: string;
  body: string;
  trackOpens: boolean;
  trackClicks: boolean;
  connectionId?: string;
}): Promise<SendEmailResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  if (!args.subject.trim()) return { ok: false, error: "Subject is required" };
  if (!args.body.trim()) return { ok: false, error: "Body is required" };

  const admin = createAdminClient();

  // Look up the contact (verify ownership + get email)
  const { data: contact } = await admin
    .from("contacts")
    .select("id, user_id, email, first_name, last_name")
    .eq("id", args.contactId)
    .maybeSingle();
  if (!contact) return { ok: false, error: "Contact not found" };
  if (contact.user_id !== user.id) return { ok: false, error: "Not your contact" };

  // Pick an Outlook connection
  let connQuery = admin
    .from("outlook_connections")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (args.connectionId) connQuery = connQuery.eq("id", args.connectionId);
  const { data: conns } = await connQuery.order("created_at", { ascending: true }).limit(1);
  const conn = conns?.[0];
  if (!conn) {
    return { ok: false, error: "No active Outlook connection. Connect Outlook in Settings first." };
  }

  // Refresh token if needed
  let accessToken = conn.access_token;
  const expiresAt = new Date(conn.token_expires_at).getTime();
  if (expiresAt < Date.now() + 5 * 60 * 1000) {
    try {
      const tokens = await refreshAccessToken(conn.refresh_token);
      const newExpires = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      await admin
        .from("outlook_connections")
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: newExpires,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conn.id);
      accessToken = tokens.access_token;
    } catch (e: any) {
      return { ok: false, error: `Token refresh failed: ${e.message}` };
    }
  }

  // Pre-allocate the activity row so we have an id for the tracking pixel/links.
  const nowIso = new Date().toISOString();
  const { data: activity, error: insErr } = await admin
    .from("activities")
    .insert({
      user_id: user.id,
      contact_id: contact.id,
      channel: "email",
      direction: "outbound",
      subject: args.subject.trim(),
      body: args.body,
      occurred_at: nowIso,
      source: "outlook_compose",
      mailbox_address: conn.mailbox_address,
      status: "sent",
      tracking_enabled: args.trackOpens || args.trackClicks,
      metadata: {
        track_opens: args.trackOpens,
        track_clicks: args.trackClicks,
      },
    })
    .select("id")
    .single();
  if (insErr || !activity) {
    return { ok: false, error: insErr?.message || "Could not record activity" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://outreach-ryan-sris-projects.vercel.app";
  const html = buildTrackedHtml({
    plainBody: args.body,
    activityId: activity.id,
    appUrl,
    trackOpens: args.trackOpens,
    trackClicks: args.trackClicks,
  });

  try {
    await sendMail(accessToken, {
      subject: args.subject.trim(),
      bodyHtml: html,
      to: [{ address: contact.email, name: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || undefined }],
    });
  } catch (e: any) {
    // Mark the activity as failed but leave the row so the user sees it.
    await admin
      .from("activities")
      .update({ status: "failed", metadata: { ...(activity as any).metadata, error: e.message } })
      .eq("id", activity.id);
    return { ok: false, error: `Outlook rejected the send: ${e.message}` };
  }

  // Advance lead_stage forward (mirrors the sequence engine behaviour).
  await admin
    .from("contacts")
    .update({ lead_stage: "email_sent" })
    .eq("id", contact.id)
    .eq("lead_stage", "new_lead");

  revalidatePath(`/contacts/${contact.id}`);
  revalidatePath("/contacts");
  return { ok: true, activityId: activity.id, mailbox: conn.mailbox_address };
}
