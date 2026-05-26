"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadStage } from "@/lib/types";

const TERMINAL_STAGES: LeadStage[] = [
  "replied",
  "meeting_booked",
  "closed_won",
  "closed_lost",
  "bounced",
  "not_a_fit",
];
// Only "not_a_fit" cascades to the whole email domain. "Replied" is a
// per-person signal — one contact replying doesn't mean the company is out.
const CASCADE_STAGES: LeadStage[] = ["not_a_fit"];

/**
 * Update a contact's lead_stage. If the new stage is a "cascade" stage
 * (replied or not_a_fit), additionally:
 *   - Find all other contacts owned by the same user with the SAME email
 *     domain (e.g. @acme.com).
 *   - Mark them lead_stage="not_a_fit".
 *   - Exit any of their active enrollments immediately (so the change is
 *     visible without waiting for the cron tick).
 *
 * The original contact's stage is whatever the user picked (replied or
 * not_a_fit). Their own active enrollments are also exited.
 */
export async function setContactLeadStage(
  contactId: string,
  newStage: LeadStage,
): Promise<
  | { ok: true; cascadeCount: number }
  | { ok: false; error: string }
> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const admin = createAdminClient();

  // 1. Load the target contact (and verify ownership).
  const { data: target, error: tErr } = await admin
    .from("contacts")
    .select("id, user_id, email, lead_stage")
    .eq("id", contactId)
    .maybeSingle();
  if (tErr) return { ok: false, error: tErr.message };
  if (!target) return { ok: false, error: "Contact not found" };
  if (target.user_id !== user.id) return { ok: false, error: "Not your contact" };

  // 2. Update the target's lead_stage.
  {
    const { error } = await admin
      .from("contacts")
      .update({ lead_stage: newStage })
      .eq("id", contactId);
    if (error) return { ok: false, error: error.message };
  }

  // 3. If terminal, exit the target's active enrollments now.
  if (TERMINAL_STAGES.includes(newStage)) {
    await exitActiveEnrollments(admin, [contactId], `lead_stage:${newStage}`);
  }

  // 4. Cascade by email domain if the stage triggers it.
  let cascadeCount = 0;
  if (CASCADE_STAGES.includes(newStage)) {
    const email = (target.email || "").toLowerCase();
    const at = email.lastIndexOf("@");
    const domain = at >= 0 ? email.slice(at + 1) : "";
    if (domain) {
      // Find sibling contacts with same domain (excluding the target),
      // skipping any that are already at a terminal stage.
      const { data: siblings } = await admin
        .from("contacts")
        .select("id, lead_stage")
        .eq("user_id", target.user_id)
        .neq("id", contactId)
        .ilike("email", `%@${domain}`);
      const siblingIds = (siblings || [])
        .filter((c: any) => !TERMINAL_STAGES.includes(c.lead_stage as LeadStage))
        .map((c: any) => c.id);

      if (siblingIds.length > 0) {
        // Mark them not_a_fit.
        const { error: upErr } = await admin
          .from("contacts")
          .update({ lead_stage: "not_a_fit" })
          .in("id", siblingIds);
        if (upErr) return { ok: false, error: upErr.message };
        // Exit their active enrollments.
        await exitActiveEnrollments(admin, siblingIds, "cascade:not_a_fit");
        cascadeCount = siblingIds.length;
      }
    }
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/sequences");

  return { ok: true, cascadeCount };
}

async function exitActiveEnrollments(
  admin: ReturnType<typeof createAdminClient>,
  contactIds: string[],
  reason: string,
) {
  if (contactIds.length === 0) return;
  await admin
    .from("enrollments")
    .update({
      status: "exited",
      exit_reason: reason,
      completed_at: new Date().toISOString(),
      next_run_at: null,
    })
    .in("contact_id", contactIds)
    .eq("status", "active");
}

/**
 * Add contacts to an existing list. If that list is the recipient list of one
 * or more ACTIVE sequences, enroll the newly-added contacts into those
 * sequences so they start the outreach flow immediately (subject to the usual
 * send-day / daily-cap / follow-up-priority rules).
 *
 * Idempotent: contacts already on the list are skipped; contacts already
 * enrolled in a sequence are skipped; contacts at a terminal lead_stage
 * (bounced/replied/not_a_fit/closed/booked) are NOT enrolled.
 */
export async function addContactsToList(
  listId: string,
  contactIds: string[],
): Promise<
  | { ok: true; added: number; enrolled: { sequence: string; count: number }[] }
  | { ok: false; error: string }
> {
  if (contactIds.length === 0) return { ok: false, error: "No contacts selected" };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // Verify the list belongs to the user.
  const { data: list } = await supabase
    .from("contact_lists")
    .select("id, name, user_id")
    .eq("id", listId)
    .maybeSingle();
  if (!list || list.user_id !== user.id) {
    return { ok: false, error: "List not found" };
  }

  // 1. Add to list — skip ones already on it (unique(list_id, contact_id)).
  const { data: alreadyOn } = await supabase
    .from("list_contacts")
    .select("contact_id")
    .eq("list_id", listId)
    .in("contact_id", contactIds);
  const onListSet = new Set((alreadyOn || []).map((r: any) => r.contact_id));
  const newToList = contactIds.filter((id) => !onListSet.has(id));

  if (newToList.length > 0) {
    const { error } = await supabase
      .from("list_contacts")
      .insert(newToList.map((cid) => ({ list_id: listId, contact_id: cid })));
    if (error) return { ok: false, error: error.message };
  }

  // 2. Find ACTIVE sequences whose recipient list is this one.
  const { data: sequences } = await supabase
    .from("sequences")
    .select("id, name, status")
    .eq("user_id", user.id)
    .eq("list_id", listId)
    .eq("status", "active");

  const enrolled: { sequence: string; count: number }[] = [];

  for (const seq of sequences || []) {
    // First step
    const { data: firstStep } = await supabase
      .from("sequence_steps")
      .select("id")
      .eq("sequence_id", seq.id)
      .order("step_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!firstStep) continue;

    // Already enrolled?
    const { data: existingEnr } = await supabase
      .from("enrollments")
      .select("contact_id")
      .eq("sequence_id", seq.id)
      .in("contact_id", contactIds);
    const enrolledSet = new Set((existingEnr || []).map((e: any) => e.contact_id));

    // Skip terminal-stage contacts (don't enroll someone already disqualified).
    const { data: stageRows } = await supabase
      .from("contacts")
      .select("id, lead_stage")
      .in("id", contactIds);
    const terminalSet = new Set(
      (stageRows || [])
        .filter((c: any) => TERMINAL_STAGES.includes(c.lead_stage))
        .map((c: any) => c.id),
    );

    const now = new Date().toISOString();
    const toEnroll = contactIds.filter(
      (id) => !enrolledSet.has(id) && !terminalSet.has(id),
    );
    if (toEnroll.length === 0) continue;

    const { data: inserted, error } = await supabase
      .from("enrollments")
      .insert(
        toEnroll.map((cid) => ({
          sequence_id: seq.id,
          contact_id: cid,
          current_step_id: firstStep.id,
          status: "active",
          next_run_at: now,
          enrolled_at: now,
        })),
      )
      .select("id");
    if (error) return { ok: false, error: `Enrolling into "${seq.name}": ${error.message}` };
    enrolled.push({ sequence: seq.name, count: inserted?.length || 0 });
  }

  revalidatePath("/contacts");
  revalidatePath("/sequences");
  return { ok: true, added: newToList.length, enrolled };
}
