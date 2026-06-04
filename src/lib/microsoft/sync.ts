// Outlook → Outreach sync logic.
// Pulls messages from each connected mailbox where:
//   - the email is tagged with the "Outreach" category, OR
//   - one of the participants is already a contact in your CRM.
// For each captured message: upsert a contact if needed, then upsert into
// the `activities` table.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  refreshAccessToken,
  listMessagesByCategory,
  listMessagesByContact,
  type GraphMessage,
} from "./graph";

const OUTREACH_CATEGORY = "Outreach";

type Connection = {
  id: string;
  user_id: string;
  mailbox_address: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
};

export type SyncResult = {
  mailbox: string;
  fetched_inbox: number;
  fetched_sent: number;
  activities_created: number;
  contacts_created: number;
  replies_marked: number;
  error?: string;
};

/**
 * Get a fresh access token, refreshing if needed.
 * Persists rotated tokens back to outlook_connections.
 */
async function ensureFreshToken(admin: SupabaseClient, conn: Connection): Promise<string> {
  const expiresAt = new Date(conn.token_expires_at).getTime();
  // Refresh if expiring within next 5 minutes.
  if (expiresAt > Date.now() + 5 * 60 * 1000) return conn.access_token;

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
  return tokens.access_token;
}

async function captureMessage(
  admin: SupabaseClient,
  args: {
    userId: string;
    mailboxAddress: string;
    msg: GraphMessage;
    direction: "inbound" | "outbound";
  },
): Promise<{ activity_created: boolean; contact_created: boolean; reply_marked: boolean }> {
  const { userId, mailboxAddress, msg, direction } = args;

  // Determine the "other party" — the contact's email.
  let otherEmail: string | null = null;
  let otherName: string | null = null;
  if (direction === "inbound") {
    otherEmail = msg.from?.emailAddress?.address?.toLowerCase() ?? null;
    otherName = msg.from?.emailAddress?.name ?? null;
  } else {
    const recipient = msg.toRecipients?.[0];
    otherEmail = recipient?.emailAddress?.address?.toLowerCase() ?? null;
    otherName = recipient?.emailAddress?.name ?? null;
  }

  // Skip if no other party (drafts, etc.)
  if (!otherEmail) return { activity_created: false, contact_created: false, reply_marked: false };

  // Skip if it's the user's own mailbox on both ends.
  if (otherEmail === mailboxAddress.toLowerCase()) {
    return { activity_created: false, contact_created: false, reply_marked: false };
  }

  // Look up the contact by email.
  let contactId: string | null = null;
  let contactWasCreated = false;
  {
    const { data: existing } = await admin
      .from("contacts")
      .select("id, lead_stage")
      .eq("user_id", userId)
      .ilike("email", otherEmail)
      .maybeSingle();
    if (existing) {
      contactId = existing.id;
    } else {
      // Auto-create if this message was tagged with "Outreach" — otherwise we
      // only capture for already-known contacts (handled by the caller).
      const isTagged = (msg.categories || []).includes(OUTREACH_CATEGORY);
      if (isTagged) {
        const [firstName, ...rest] = (otherName || "").trim().split(/\s+/);
        const lastName = rest.join(" ");
        const { data: inserted } = await admin
          .from("contacts")
          .insert({
            user_id: userId,
            email: otherEmail,
            first_name: firstName || null,
            last_name: lastName || null,
            tags: ["via-outlook"],
          })
          .select("id")
          .single();
        if (inserted) {
          contactId = inserted.id;
          contactWasCreated = true;
        }
      }
    }
  }
  if (!contactId) {
    // No contact and not tagged → skip
    return { activity_created: false, contact_created: false, reply_marked: false };
  }

  // Insert activity (idempotent via unique(user_id, source, source_id))
  const occurredAt =
    direction === "outbound"
      ? msg.sentDateTime || msg.receivedDateTime
      : msg.receivedDateTime;
  const body = msg.body?.content ?? msg.bodyPreview ?? null;
  const { error: insErr } = await admin
    .from("activities")
    .insert({
      user_id: userId,
      contact_id: contactId,
      channel: "email",
      direction,
      subject: msg.subject ?? null,
      body,
      occurred_at: occurredAt,
      source: "outlook",
      source_id: msg.id,
      mailbox_address: mailboxAddress,
      metadata: {
        internet_message_id: msg.internetMessageId,
        conversation_id: msg.conversationId,
        categories: msg.categories || [],
      },
    });

  let activityCreated = !insErr;
  // If the unique constraint hit, the row already existed — that's fine, count as not-newly-created.
  if (insErr && !String(insErr.message).match(/duplicate|unique/i)) {
    throw new Error(`activity insert: ${insErr.message}`);
  }
  if (insErr) activityCreated = false;

  // Auto-mark replied on inbound from a contact.
  let replyMarked = false;
  if (direction === "inbound") {
    const { data: updated } = await admin
      .from("contacts")
      .update({ lead_stage: "replied" })
      .eq("id", contactId)
      .not("lead_stage", "in", "(replied,meeting_booked,closed_won,closed_lost,not_a_fit,bounced)")
      .select("id");
    if (updated && updated.length > 0) {
      replyMarked = true;
      // Exit active enrollments immediately
      await admin
        .from("enrollments")
        .update({
          status: "exited",
          exit_reason: "lead_stage:replied",
          completed_at: new Date().toISOString(),
          next_run_at: null,
        })
        .eq("contact_id", contactId)
        .eq("status", "active");
    }
  }

  return {
    activity_created: activityCreated,
    contact_created: contactWasCreated,
    reply_marked: replyMarked,
  };
}

export async function syncConnection(
  admin: SupabaseClient,
  conn: Connection,
  options: { sinceIso: string },
): Promise<SyncResult> {
  const result: SyncResult = {
    mailbox: conn.mailbox_address,
    fetched_inbox: 0,
    fetched_sent: 0,
    activities_created: 0,
    contacts_created: 0,
    replies_marked: 0,
  };

  let accessToken: string;
  try {
    accessToken = await ensureFreshToken(admin, conn);
  } catch (e: any) {
    result.error = `token refresh: ${e.message}`;
    await admin
      .from("outlook_connections")
      .update({ status: "error", last_sync_status: result.error, updated_at: new Date().toISOString() })
      .eq("id", conn.id);
    return result;
  }

  try {
    // 1. Sent items tagged with "Outreach"
    const sent = await listMessagesByCategory(accessToken, {
      folder: "sentitems",
      category: OUTREACH_CATEGORY,
      sinceIso: options.sinceIso,
      top: 50,
    });
    result.fetched_sent = sent.value.length;
    for (const msg of sent.value) {
      const r = await captureMessage(admin, {
        userId: conn.user_id,
        mailboxAddress: conn.mailbox_address,
        msg,
        direction: "outbound",
      });
      if (r.activity_created) result.activities_created++;
      if (r.contact_created) result.contacts_created++;
    }

    // 2. Inbox: for each known contact, find replies to us
    const { data: contacts } = await admin
      .from("contacts")
      .select("email")
      .eq("user_id", conn.user_id);
    for (const c of contacts || []) {
      const inbox = await listMessagesByContact(accessToken, {
        folder: "inbox",
        contactEmail: c.email,
        sinceIso: options.sinceIso,
        top: 25,
      });
      result.fetched_inbox += inbox.value.length;
      for (const msg of inbox.value) {
        const r = await captureMessage(admin, {
          userId: conn.user_id,
          mailboxAddress: conn.mailbox_address,
          msg,
          direction: "inbound",
        });
        if (r.activity_created) result.activities_created++;
        if (r.reply_marked) result.replies_marked++;
      }
    }

    await admin
      .from("outlook_connections")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "ok",
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id);
  } catch (e: any) {
    result.error = e.message;
    await admin
      .from("outlook_connections")
      .update({ status: "error", last_sync_status: result.error, updated_at: new Date().toISOString() })
      .eq("id", conn.id);
  }

  return result;
}
