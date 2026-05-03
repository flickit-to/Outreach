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
const CASCADE_STAGES: LeadStage[] = ["replied", "not_a_fit"];

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
