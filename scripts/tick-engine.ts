// Manually tick due enrollments for one sequence by calling runEnrollmentTick
// directly. Mirrors what the cron endpoint does. Use to debug when the
// "Run engine now" button doesn't appear to do anything.
//
// Run:
//   npx tsx --env-file=.env.production.local scripts/tick-engine.ts
//   npx tsx --env-file=.env.production.local scripts/tick-engine.ts --reset-due

import { createClient } from "@supabase/supabase-js";
import { runEnrollmentTick } from "../src/lib/engine/run-sequence-tick";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const SEQUENCE_ID = "126b442b-d806-4f7f-91c1-dae335c083d0";
const MAX_TICKS = 200;

async function main() {
  const resetDue = process.argv.includes("--reset-due");

  if (resetDue) {
    // Only reset enrollments at EMAIL steps. Resetting wait/condition
    // enrollments collapses their wait timer to 0 and makes the sequence
    // misfire. Use case: re-trying a failed email send (e.g. after fixing a
    // schema bug that made all sends defer). Wait/condition enrollments
    // should keep their original next_run_at.
    const { data: emailSteps } = await sb
      .from("sequence_steps")
      .select("id")
      .eq("sequence_id", SEQUENCE_ID)
      .eq("type", "email");
    const emailStepIds = (emailSteps || []).map((s: any) => s.id);
    if (emailStepIds.length === 0) {
      console.log("No email steps in this sequence — nothing to reset.\n");
    } else {
      const now = new Date().toISOString();
      const { count } = await sb
        .from("enrollments")
        .update({ next_run_at: now }, { count: "exact" })
        .eq("sequence_id", SEQUENCE_ID)
        .eq("status", "active")
        .gt("next_run_at", now)
        .in("current_step_id", emailStepIds);
      console.log(`\nReset ${count || 0} active+deferred email-step enrollments to next_run_at = now`);
      console.log(`(Wait and condition enrollments left alone — their timers preserved.)\n`);
    }
  }

  console.log(`Ticking sequence ${SEQUENCE_ID} (max ${MAX_TICKS})\n`);

  // Pre-fetch all due enrollments + their current step_order so we can
  // prioritize follow-ups (step_order > 1) over new outreach (step_order = 1).
  // Sort: higher step_order first, then older next_run_at first.
  const { data: dueAll } = await sb
    .from("enrollments")
    .select("*, step:current_step_id(step_order)")
    .eq("sequence_id", SEQUENCE_ID)
    .eq("status", "active")
    .lte("next_run_at", new Date().toISOString())
    .limit(MAX_TICKS * 2);

  const queue = [...(dueAll || [])]
    .sort((a: any, b: any) => {
      const aOrder = a.step?.step_order ?? 0;
      const bOrder = b.step?.step_order ?? 0;
      if (aOrder !== bOrder) return bOrder - aOrder;
      return (a.next_run_at || "").localeCompare(b.next_run_at || "");
    })
    .slice(0, MAX_TICKS);

  console.log(`Queue: ${queue.length} enrollments (priority: follow-ups first)\n`);

  const tally: Record<string, number> = {};
  for (let i = 0; i < queue.length; i++) {
    const e = queue[i];
    try {
      const r = await runEnrollmentTick(e as never, sb);
      const key = "reason" in r ? `${r.kind}:${r.reason}` : r.kind;
      tally[key] = (tally[key] || 0) + 1;
      if (i < 3 || i % 20 === 0) {
        const stepLabel = e.step?.step_order ? `step${e.step.step_order}` : "??";
        console.log(`  tick ${i + 1} [${stepLabel}]: ${key}`);
      }
    } catch (err: any) {
      tally["error"] = (tally["error"] || 0) + 1;
      console.error(`  tick ${i + 1}: ERROR — ${err.message}`);
    }
  }
  if (queue.length === 0) {
    console.log(`No due enrollments.`);
  }

  console.log(`\nTally:`);
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(4)}  ${k}`);
  }

  const { count: sentCount } = await sb
    .from("sends")
    .select("*", { count: "exact", head: true })
    .eq("sequence_id", SEQUENCE_ID);

  const { data: bySender } = await sb
    .from("sends")
    .select("from_email_address, status")
    .eq("sequence_id", SEQUENCE_ID);
  const senderTally: Record<string, number> = {};
  const statusTally: Record<string, number> = {};
  for (const s of bySender || []) {
    senderTally[s.from_email_address || "(null)"] = (senderTally[s.from_email_address || "(null)"] || 0) + 1;
    statusTally[s.status] = (statusTally[s.status] || 0) + 1;
  }
  console.log(`\nTotal sends now: ${sentCount}`);
  if (Object.keys(senderTally).length) {
    console.log(`By from_email_address:`);
    for (const [a, n] of Object.entries(senderTally)) console.log(`  ${n.toString().padStart(3)}  ${a}`);
  }
  if (Object.keys(statusTally).length) {
    console.log(`By status:`);
    for (const [a, n] of Object.entries(statusTally)) console.log(`  ${n.toString().padStart(3)}  ${a}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
