// Sequence engine: advances one enrollment by one step. Idempotent —
// re-running on the same enrollment will safely no-op if it has nothing to do.
//
// Lifecycle:
//   active → (advance through steps) → completed | exited | unsubscribed
//
// Each tick the engine looks at the enrollment's current step and:
//   - email step:   sends (or dry-runs) and schedules next step immediately
//   - wait step:    schedules next step after the delay
//   - condition:    evaluates engagement; advances on match, exits on miss
//
// Auto-exit: if the contact's lead_stage is replied/meeting_booked/closed_*,
// the enrollment exits before any step runs.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient } from "@/lib/resend/client";
import { processEmailBody, processSubject } from "@/lib/resend/templates";
import {
  addDays,
  isAutoExitLeadStage,
  isTodayASendDay,
  nextSendDayAt9am,
} from "./utils";

export type StepRow = {
  id: string;
  sequence_id: string;
  step_order: number;
  type: "email" | "wait" | "condition";
  subject: string | null;
  subject_b: string | null;
  body: string | null;
  send_as_reply: boolean;
  delay_days: number | null;
  delay_hours: number | null;
  triggers: string[] | null;
  within_days: number | null;
};

export type EnrollmentRow = {
  id: string;
  sequence_id: string;
  contact_id: string;
  current_step_id: string | null;
  status: string;
  next_run_at: string | null;
};

export type TickResult =
  | { kind: "noop"; reason: string }
  | { kind: "step_advanced"; step_type: string; next_run_at: string | null }
  | { kind: "completed" }
  | { kind: "exited"; reason: string }
  | { kind: "deferred"; reason: string; next_run_at: string };

export async function runEnrollmentTick(
  enrollment: EnrollmentRow,
  sb: SupabaseClient,
): Promise<TickResult> {
  if (enrollment.status !== "active") {
    return { kind: "noop", reason: `enrollment status=${enrollment.status}` };
  }
  if (!enrollment.current_step_id) {
    return { kind: "noop", reason: "no current step" };
  }

  // Auto-exit: replied/booked/closed contacts
  const { data: contact } = await sb
    .from("contacts")
    .select("*")
    .eq("id", enrollment.contact_id)
    .maybeSingle();
  if (!contact) {
    await markExited(sb, enrollment.id, "contact_missing");
    return { kind: "exited", reason: "contact_missing" };
  }
  if (isAutoExitLeadStage(contact.lead_stage)) {
    await markExited(sb, enrollment.id, `lead_stage:${contact.lead_stage}`);
    return { kind: "exited", reason: `lead_stage:${contact.lead_stage}` };
  }

  // Load current step + sequence
  const [{ data: step }, { data: sequence }] = await Promise.all([
    sb.from("sequence_steps").select("*").eq("id", enrollment.current_step_id).maybeSingle(),
    sb.from("sequences").select("*").eq("id", enrollment.sequence_id).maybeSingle(),
  ]);
  if (!step) {
    await markExited(sb, enrollment.id, "step_missing");
    return { kind: "exited", reason: "step_missing" };
  }
  if (!sequence) {
    await markExited(sb, enrollment.id, "sequence_missing");
    return { kind: "exited", reason: "sequence_missing" };
  }

  const typedStep = step as StepRow;

  // Find the next step in order (one-past current)
  const { data: nextStepRow } = await sb
    .from("sequence_steps")
    .select("*")
    .eq("sequence_id", enrollment.sequence_id)
    .gt("step_order", typedStep.step_order)
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  const nextStep = nextStepRow as StepRow | null;

  // Compute when an enrollment should next tick after ARRIVING at a given step.
  // Wait steps "hold" the enrollment for their delay; email/condition fire now.
  const nextRunAfterArrivingAt = (step: StepRow | null): Date => {
    if (!step) return new Date();
    if (step.type === "wait") {
      const delayMs =
        (step.delay_days ?? 0) * 86_400_000 +
        (step.delay_hours ?? 0) * 3_600_000;
      return new Date(Date.now() + delayMs);
    }
    return new Date();
  };

  // ─── EMAIL ────────────────────────────────────────────────────────────────
  if (typedStep.type === "email") {
    // send_days check
    if (!isTodayASendDay(sequence.send_days)) {
      const nextRun = nextSendDayAt9am(sequence.send_days);
      await sb
        .from("enrollments")
        .update({ next_run_at: nextRun.toISOString() })
        .eq("id", enrollment.id);
      return { kind: "deferred", reason: "not_a_send_day", next_run_at: nextRun.toISOString() };
    }

    const sendResult = await sendEmailStep({
      sb,
      sequence,
      step: typedStep,
      contact,
    });
    if (sendResult.kind === "deferred") {
      await sb
        .from("enrollments")
        .update({ next_run_at: sendResult.next_run_at })
        .eq("id", enrollment.id);
      return { kind: "deferred", reason: sendResult.reason, next_run_at: sendResult.next_run_at };
    }
    if (sendResult.kind === "failed") {
      // Don't exit on a single send failure — let it retry next tick
      const retry = addDays(new Date(), 0, 1).toISOString(); // retry in 1h
      await sb
        .from("enrollments")
        .update({ next_run_at: retry })
        .eq("id", enrollment.id);
      return { kind: "deferred", reason: "send_failed_retry", next_run_at: retry };
    }

    return advanceTo(sb, enrollment, nextStep, nextRunAfterArrivingAt(nextStep));
  }

  // ─── WAIT ─────────────────────────────────────────────────────────────────
  // Reaching this code means the wait has expired (next_run_at <= now), so
  // just advance immediately to whatever's after the wait.
  if (typedStep.type === "wait") {
    return advanceTo(sb, enrollment, nextStep, nextRunAfterArrivingAt(nextStep));
  }

  // ─── CONDITION ────────────────────────────────────────────────────────────
  if (typedStep.type === "condition") {
    const matched = await evaluateCondition({
      sb,
      enrollment,
      step: typedStep,
      sequenceId: enrollment.sequence_id,
    });
    if (matched) {
      return advanceTo(sb, enrollment, nextStep, nextRunAfterArrivingAt(nextStep));
    }
    await markExited(sb, enrollment.id, "condition_not_met");
    return { kind: "exited", reason: "condition_not_met" };
  }

  return { kind: "noop", reason: `unknown step type ${(typedStep as StepRow).type}` };
}

// ─── advanceTo ──────────────────────────────────────────────────────────────
async function advanceTo(
  sb: SupabaseClient,
  enrollment: EnrollmentRow,
  nextStep: StepRow | null,
  nextRunAt: Date,
): Promise<TickResult> {
  if (!nextStep) {
    await sb
      .from("enrollments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        current_step_id: null,
        next_run_at: null,
      })
      .eq("id", enrollment.id);
    return { kind: "completed" };
  }
  await sb
    .from("enrollments")
    .update({
      current_step_id: nextStep.id,
      next_run_at: nextRunAt.toISOString(),
    })
    .eq("id", enrollment.id);
  return {
    kind: "step_advanced",
    step_type: nextStep.type,
    next_run_at: nextRunAt.toISOString(),
  };
}

async function markExited(sb: SupabaseClient, enrollmentId: string, reason: string) {
  await sb
    .from("enrollments")
    .update({
      status: "exited",
      exit_reason: reason,
      completed_at: new Date().toISOString(),
      next_run_at: null,
    })
    .eq("id", enrollmentId);
}

// ─── Email send ─────────────────────────────────────────────────────────────
async function sendEmailStep({
  sb,
  sequence,
  step,
  contact,
}: {
  sb: SupabaseClient;
  sequence: any;
  step: StepRow;
  contact: any;
}): Promise<
  | { kind: "sent"; sendId: string }
  | { kind: "deferred"; reason: string; next_run_at: string }
  | { kind: "failed"; reason: string }
> {
  if (!step.subject || !step.body) {
    return { kind: "failed", reason: "missing_subject_or_body" };
  }

  // Settings + sender
  const { data: settings } = await sb
    .from("settings")
    .select("*")
    .eq("user_id", sequence.user_id)
    .maybeSingle();

  // Pick sender. If sequence has from_email_id, use it. Else use first
  // sender_email for user. Else fall back to settings.from_email.
  let senderId: string | null = null;
  let senderEmail: string | null = null;
  let senderName: string | null = null;
  if (sequence.from_email_id) {
    const { data } = await sb
      .from("sender_emails")
      .select("*")
      .eq("id", sequence.from_email_id)
      .maybeSingle();
    if (data) {
      senderId = data.id;
      senderEmail = data.email;
      senderName = data.name;
    }
  }
  if (!senderEmail) {
    const { data } = await sb
      .from("sender_emails")
      .select("*")
      .eq("user_id", sequence.user_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) {
      senderId = data.id;
      senderEmail = data.email;
      senderName = data.name;
    }
  }
  if (!senderEmail && settings?.from_email) {
    senderEmail = settings.from_email;
    senderName = settings.from_name || "Outreach";
  }
  if (!senderEmail) {
    const next = nextSendDayAt9am(sequence.send_days);
    return { kind: "deferred", reason: "no_sender_configured", next_run_at: next.toISOString() };
  }

  const dryRun = !settings?.resend_api_key;

  // Insert send row first so we have an id for the tracking pixel
  const { data: sendRow, error: sendErr } = await sb
    .from("sends")
    .insert({
      user_id: sequence.user_id,
      contact_id: contact.id,
      sequence_id: sequence.id,
      sequence_step_id: step.id,
      sender_email_id: senderId,
      from_email_address: senderEmail,
      status: "pending",
      variant: "A",
    })
    .select()
    .single();
  if (sendErr || !sendRow) {
    return { kind: "failed", reason: sendErr?.message || "send_insert_failed" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const html = processEmailBody(step.body, contact, sendRow.id, appUrl, {
    html: settings?.signature_html || null,
    imageUrl: settings?.signature_image_url || null,
  });
  const subject = processSubject(step.subject, contact);

  // Reply threading: if step.send_as_reply, find the most recent prior send
  // for this contact in this sequence and use its message_id.
  const headers: Record<string, string> = {};
  if (step.send_as_reply) {
    const { data: priorSend } = await sb
      .from("sends")
      .select("message_id")
      .eq("sequence_id", sequence.id)
      .eq("contact_id", contact.id)
      .neq("id", sendRow.id)
      .not("message_id", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (priorSend?.message_id) {
      headers["In-Reply-To"] = priorSend.message_id;
      headers["References"] = priorSend.message_id;
    }
  }

  if (dryRun) {
    await sb
      .from("sends")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        message_id: `dry-run-${sendRow.id}`,
      })
      .eq("id", sendRow.id);
    await sb.from("events").insert({
      send_id: sendRow.id,
      type: "sent",
      metadata: { dry_run: true, subject, sequence_step_id: step.id },
    });
  } else {
    try {
      const resend = getResendClient(settings.resend_api_key);
      const payload: any = {
        from: `${senderName} <${senderEmail}>`,
        to: [contact.email],
        subject,
        html,
      };
      if (Object.keys(headers).length > 0) payload.headers = headers;
      const { data: emailData, error: emailError } = await resend.emails.send(payload);
      if (emailError || !emailData) {
        await sb.from("sends").update({ status: "failed" }).eq("id", sendRow.id);
        return { kind: "failed", reason: emailError?.message || "resend_failed" };
      }
      const messageId =
        (emailData as any)?.message_id || (emailData as any)?.messageId || null;
      await sb
        .from("sends")
        .update({
          resend_id: emailData.id || null,
          message_id: messageId,
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", sendRow.id);
      await sb.from("events").insert({ send_id: sendRow.id, type: "sent" });
    } catch (e: any) {
      await sb.from("sends").update({ status: "failed" }).eq("id", sendRow.id);
      return { kind: "failed", reason: e.message || "send_threw" };
    }
  }

  // Auto-advance lead_stage (mirror of campaign engine)
  const { count: priorSentCount } = await sb
    .from("sends")
    .select("*", { count: "exact", head: true })
    .eq("contact_id", contact.id)
    .neq("id", sendRow.id)
    .in("status", ["sent", "delivered", "opened", "clicked"]);

  if ((priorSentCount || 0) > 0) {
    await sb
      .from("contacts")
      .update({ lead_stage: "follow_up_sent" })
      .eq("id", contact.id)
      .in("lead_stage", ["new_lead", "email_sent", "opened", "follow_up_needed"]);
  } else {
    await sb
      .from("contacts")
      .update({ lead_stage: "email_sent" })
      .eq("id", contact.id)
      .eq("lead_stage", "new_lead");
  }

  return { kind: "sent", sendId: sendRow.id };
}

// ─── Condition evaluation ──────────────────────────────────────────────────
async function evaluateCondition({
  sb,
  enrollment,
  step,
  sequenceId,
}: {
  sb: SupabaseClient;
  enrollment: EnrollmentRow;
  step: StepRow;
  sequenceId: string;
}): Promise<boolean> {
  const triggers = step.triggers || [];
  const windowMs = (step.within_days || 7) * 86_400_000;
  const since = new Date(Date.now() - windowMs).toISOString();

  // Find prior email steps in this sequence (step_order < this step's)
  const { data: priorEmailSteps } = await sb
    .from("sequence_steps")
    .select("id")
    .eq("sequence_id", sequenceId)
    .lt("step_order", step.step_order)
    .eq("type", "email");
  const priorEmailStepIds = (priorEmailSteps || []).map((s: any) => s.id);
  if (priorEmailStepIds.length === 0) return false;

  // Find this contact's sends from those steps within the window
  const { data: sends } = await sb
    .from("sends")
    .select("status, opened_at, clicked_at, replied_at, sent_at")
    .eq("contact_id", enrollment.contact_id)
    .eq("sequence_id", sequenceId)
    .in("sequence_step_id", priorEmailStepIds)
    .gte("sent_at", since);

  if (!sends || sends.length === 0) return false;

  const wantsNotOpened = triggers.includes("not_opened");
  const positiveTriggers = triggers.filter((t) => t !== "not_opened");

  // Positive triggers: at least one matches → true
  const matchSend = (s: any, trigger: string): boolean => {
    switch (trigger) {
      case "opened":
      case "opened_or_clicked":
        return ["opened", "clicked", "replied"].includes(s.status) || !!s.opened_at;
      case "clicked":
        return s.status === "clicked" || !!s.clicked_at;
      case "replied":
        return s.status === "replied" || !!s.replied_at;
      default:
        return false;
    }
  };

  for (const t of positiveTriggers) {
    if (sends.some((s: any) => matchSend(s, t))) return true;
  }

  // not_opened: matches if there's a send with status in [sent, delivered] and
  // no opened/clicked/replied event AND it's been at least within_days since sent
  if (wantsNotOpened) {
    const cutoff = new Date(Date.now() - (step.within_days || 7) * 86_400_000);
    const stale = sends.some(
      (s: any) =>
        ["sent", "delivered"].includes(s.status) &&
        !s.opened_at && !s.clicked_at && !s.replied_at &&
        s.sent_at &&
        new Date(s.sent_at) <= cutoff,
    );
    if (stale) return true;
  }

  return false;
}
