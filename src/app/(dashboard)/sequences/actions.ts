"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sequenceSchema, type SequenceInput } from "@/lib/validators";
import { runEnrollmentTick } from "@/lib/engine/run-sequence-tick";

export async function createSequence(input: SequenceInput) {
  const parsed = sequenceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in" };

  const { steps, ...seq } = parsed.data;

  const { data: created, error: seqErr } = await supabase
    .from("sequences")
    .insert({
      user_id: user.id,
      name: seq.name,
      list_id: seq.list_id || null,
      from_email_id: seq.from_email_id || null,
      send_days: seq.send_days,
      scheduled_at: seq.scheduled_at || null,
      status: "draft",
    })
    .select()
    .single();
  if (seqErr || !created) {
    return { ok: false as const, error: seqErr?.message || "Failed to create sequence" };
  }

  // Insert steps in order
  const stepRows = steps.map((s, idx) => ({
    sequence_id: created.id,
    step_order: idx + 1,
    type: s.type,
    subject: s.type === "email" ? s.subject : null,
    subject_b: s.type === "email" ? s.subject_b ?? null : null,
    body: s.type === "email" ? s.body : null,
    send_as_reply: s.type === "email" ? s.send_as_reply : false,
    delay_days: s.type === "wait" ? s.delay_days : null,
    delay_hours: s.type === "wait" ? s.delay_hours ?? null : null,
    triggers: s.type === "condition" ? s.triggers : null,
    within_days: s.type === "condition" ? s.within_days : null,
  }));

  if (stepRows.length > 0) {
    const { error: stepErr } = await supabase.from("sequence_steps").insert(stepRows);
    if (stepErr) {
      // Best-effort cleanup
      await supabase.from("sequences").delete().eq("id", created.id);
      return { ok: false as const, error: `Failed to create steps: ${stepErr.message}` };
    }
  }

  revalidatePath("/sequences");
  return { ok: true as const, id: created.id };
}

export async function updateSequenceStatus(
  id: string,
  status: "draft" | "active" | "paused" | "archived",
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("sequences")
    .update({ status })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/sequences");
  revalidatePath(`/sequences/${id}`);
  return { ok: true as const };
}

export async function updateSequence(id: string, input: SequenceInput) {
  const parsed = sequenceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in" };

  const { data: existing } = await supabase
    .from("sequences")
    .select("status, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false as const, error: "Sequence not found" };
  if (existing.user_id !== user.id) {
    return { ok: false as const, error: "Not your sequence" };
  }
  if (existing.status === "active") {
    return {
      ok: false as const,
      error: "Pause the sequence before editing it.",
    };
  }

  const { steps, ...seq } = parsed.data;

  // Update the sequence row
  const { error: seqErr } = await supabase
    .from("sequences")
    .update({
      name: seq.name,
      list_id: seq.list_id || null,
      from_email_id: seq.from_email_id || null,
      send_days: seq.send_days,
      scheduled_at: seq.scheduled_at || null,
    })
    .eq("id", id);
  if (seqErr) return { ok: false as const, error: seqErr.message };

  // Replace steps wholesale. Existing enrollments may have current_step_id
  // pointing at a step we're about to delete — the FK is `on delete set null`,
  // so they survive but become "homeless." Activate again to re-enrol.
  const { error: delErr } = await supabase
    .from("sequence_steps")
    .delete()
    .eq("sequence_id", id);
  if (delErr) return { ok: false as const, error: `Failed to clear steps: ${delErr.message}` };

  const stepRows = steps.map((s, idx) => ({
    sequence_id: id,
    step_order: idx + 1,
    type: s.type,
    subject: s.type === "email" ? s.subject : null,
    subject_b: s.type === "email" ? s.subject_b ?? null : null,
    body: s.type === "email" ? s.body : null,
    send_as_reply: s.type === "email" ? s.send_as_reply : false,
    delay_days: s.type === "wait" ? s.delay_days : null,
    delay_hours: s.type === "wait" ? s.delay_hours ?? null : null,
    triggers: s.type === "condition" ? s.triggers : null,
    within_days: s.type === "condition" ? s.within_days : null,
  }));

  if (stepRows.length > 0) {
    const { error: stepErr } = await supabase.from("sequence_steps").insert(stepRows);
    if (stepErr) return { ok: false as const, error: `Failed to insert steps: ${stepErr.message}` };
  }

  revalidatePath("/sequences");
  revalidatePath(`/sequences/${id}`);
  return { ok: true as const };
}

export async function deleteSequence(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in" };

  const { data: existing } = await supabase
    .from("sequences")
    .select("status, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false as const, error: "Sequence not found" };
  if (existing.user_id !== user.id) {
    return { ok: false as const, error: "Not your sequence" };
  }
  if (existing.status === "active") {
    return {
      ok: false as const,
      error: "Pause the sequence before deleting it.",
    };
  }

  // sequence_steps + enrollments cascade via FK; sends keep their rows but
  // sequence_id / sequence_step_id are set to null (history preserved).
  const { error } = await supabase.from("sequences").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/sequences");
  redirect("/sequences");
}

/**
 * Activate a sequence: enrol every contact on the chosen list.
 * - Sequence must be in 'draft' status and have a list_id and at least one step.
 * - Contacts already enrolled in this sequence are skipped (idempotent).
 * - Each new enrollment starts at step 1 with next_run_at = now.
 */
export async function activateSequence(sequenceId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in" };

  const { data: seq } = await supabase
    .from("sequences")
    .select("*")
    .eq("id", sequenceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!seq) return { ok: false as const, error: "Sequence not found" };
  if (seq.status !== "draft" && seq.status !== "paused") {
    return { ok: false as const, error: `Cannot activate from status=${seq.status}` };
  }
  if (!seq.list_id) {
    return { ok: false as const, error: "Pick a recipient list before activating" };
  }

  // First step (smallest step_order)
  const { data: firstStep } = await supabase
    .from("sequence_steps")
    .select("*")
    .eq("sequence_id", sequenceId)
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!firstStep) {
    return { ok: false as const, error: "Sequence has no steps" };
  }

  // Contacts in the list
  const { data: members } = await supabase
    .from("list_contacts")
    .select("contact_id")
    .eq("list_id", seq.list_id);
  const contactIds = (members || []).map((m) => m.contact_id);
  if (contactIds.length === 0) {
    return { ok: false as const, error: "List has no contacts" };
  }

  // Existing enrollments (skip duplicates)
  const { data: existing } = await supabase
    .from("enrollments")
    .select("contact_id")
    .eq("sequence_id", sequenceId);
  const existingSet = new Set((existing || []).map((e) => e.contact_id));

  const now = new Date().toISOString();
  const toInsert = contactIds
    .filter((cid) => !existingSet.has(cid))
    .map((cid) => ({
      sequence_id: sequenceId,
      contact_id: cid,
      current_step_id: firstStep.id,
      status: "active",
      next_run_at: now,
      enrolled_at: now,
    }));

  let enrolled = 0;
  if (toInsert.length > 0) {
    const { data, error } = await supabase
      .from("enrollments")
      .insert(toInsert)
      .select("id");
    if (error) return { ok: false as const, error: error.message };
    enrolled = data?.length || 0;
  }

  await supabase
    .from("sequences")
    .update({ status: "active" })
    .eq("id", sequenceId);

  revalidatePath(`/sequences/${sequenceId}`);
  revalidatePath("/sequences");
  return { ok: true as const, enrolled, total_contacts: contactIds.length };
}

/**
 * Pause an active sequence — stops the engine from advancing any of its
 * enrollments without exiting them. Resume by calling activateSequence again.
 */
export async function pauseSequence(sequenceId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("sequences")
    .update({ status: "paused" })
    .eq("id", sequenceId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/sequences/${sequenceId}`);
  revalidatePath("/sequences");
  return { ok: true as const };
}

/**
 * DEV ONLY: run the engine immediately for this sequence's active enrollments
 * that are due (next_run_at <= now). Lets you test the flow without waiting on
 * the real cron. Caps at 50 ticks per call to avoid runaway loops.
 */
export async function runEngineNow(sequenceId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in" };

  // Verify ownership before using admin client
  const { data: seq } = await supabase
    .from("sequences")
    .select("id, user_id")
    .eq("id", sequenceId)
    .maybeSingle();
  if (!seq || seq.user_id !== user.id) {
    return { ok: false as const, error: "Not found" };
  }

  const admin = createAdminClient();
  const results: Record<string, number> = {};
  for (let i = 0; i < 50; i++) {
    const { data: due } = await admin
      .from("enrollments")
      .select("*")
      .eq("sequence_id", sequenceId)
      .eq("status", "active")
      .lte("next_run_at", new Date().toISOString())
      .order("next_run_at", { ascending: true })
      .limit(1);
    if (!due || due.length === 0) break;
    const r = await runEnrollmentTick(due[0] as never, admin);
    results[r.kind] = (results[r.kind] || 0) + 1;
  }

  revalidatePath(`/sequences/${sequenceId}`);
  return { ok: true as const, results };
}
