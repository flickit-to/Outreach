"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshAccessToken, sendMail } from "@/lib/microsoft/graph";
import { buildTrackedHtml } from "@/lib/microsoft/compose";
import { extractCompanyFromEmail } from "@/lib/contacts/extract";

export type SendEmailResult =
  | { ok: true; activityId: string; mailbox: string; contactId: string; contactCreated: boolean }
  | { ok: false; error: string };

/**
 * Parse a recipient string. Accepts:
 *   "Ryan Sri <ryan@x.com>"  → { name: "Ryan Sri", email: "ryan@x.com" }
 *   "ryan@x.com"             → { name: null, email: "ryan@x.com" }
 */
function parseRecipient(input: string): { name: string | null; email: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) {
    const email = m[2].trim().toLowerCase();
    if (!email.includes("@")) return null;
    return { name: m[1].trim().replace(/^["']|["']$/g, ""), email };
  }
  if (trimmed.includes("@") && !/\s/.test(trimmed)) {
    return { name: null, email: trimmed.toLowerCase() };
  }
  return null;
}

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
  return {
    ok: true,
    activityId: activity.id,
    mailbox: conn.mailbox_address,
    contactId: contact.id,
    contactCreated: false,
  };
}

/**
 * Compose-from-scratch: caller provides the recipient as a free-text string
 * (just an email, or "Name <email@x>"). We find an existing contact by email
 * or auto-create one (just like the Outlook sync auto-create), then delegate
 * to sendEmailFromOutlook so the tracked-send pipeline stays single-source.
 */
export async function sendComposedEmail(args: {
  to: string;
  subject: string;
  body: string;
  trackOpens: boolean;
  trackClicks: boolean;
  connectionId?: string;
}): Promise<SendEmailResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const parsed = parseRecipient(args.to);
  if (!parsed) return { ok: false, error: "Invalid recipient address" };

  const admin = createAdminClient();

  // 1. Find existing contact by email (case-insensitive)
  const { data: existing } = await admin
    .from("contacts")
    .select("id")
    .eq("user_id", user.id)
    .ilike("email", parsed.email)
    .maybeSingle();

  let contactId = existing?.id as string | undefined;
  let contactCreated = false;

  // 2. Auto-create if missing — same shape as Outlook sync's auto-create
  if (!contactId) {
    const [firstName, ...rest] = (parsed.name || "").trim().split(/\s+/);
    const lastName = rest.join(" ");
    const company = extractCompanyFromEmail(parsed.email);
    const { data: inserted, error: insErr } = await admin
      .from("contacts")
      .insert({
        user_id: user.id,
        email: parsed.email,
        first_name: firstName || null,
        last_name: lastName || null,
        company,
        lead_stage: "email_sent",
        tags: ["via-compose"],
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      return { ok: false, error: insErr?.message || "Could not create contact" };
    }
    contactId = inserted.id;
    contactCreated = true;
  }

  // 3. Delegate to the existing tracked-send pipeline
  const r = await sendEmailFromOutlook({
    contactId: contactId!,
    subject: args.subject,
    body: args.body,
    trackOpens: args.trackOpens,
    trackClicks: args.trackClicks,
    connectionId: args.connectionId,
  });
  if (!r.ok) return r;

  revalidatePath("/contacts");
  return { ...r, contactCreated };
}
