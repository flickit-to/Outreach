// Rewind contacts who walked through the Wait step too fast back to the wait,
// with next_run_at = step1_sent_at + 3 days so the wait completes correctly.
//
// Cause: tick-engine.ts --reset-due reset every active enrollment's next_run_at
// to now — including enrollments at Wait steps, which collapsed their 3-day
// hold to instant. They advanced through Wait → Condition → Step 04 in one
// tick.
//
// Fix:
//   1. Find enrollments whose current_step_id is *past* the wait step and
//      whose advance happened today (i.e. they shouldn't have moved that far).
//   2. Set current_step_id back to the wait step.
//   3. Set next_run_at = (their step 01 send sent_at) + delay_days.
//
// Run:
//   npx tsx --env-file=.env.production.local scripts/rewind-mid-flight.ts          # dry-run
//   npx tsx --env-file=.env.production.local scripts/rewind-mid-flight.ts --apply

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const SEQUENCE_ID = "126b442b-d806-4f7f-91c1-dae335c083d0";
const apply = process.argv.includes("--apply");

async function main() {
  console.log(`\nMode: ${apply ? "\x1b[31mAPPLY\x1b[0m" : "\x1b[32mDRY-RUN\x1b[0m"}\n`);

  // 1. Pull all steps in order
  const { data: steps } = await sb
    .from("sequence_steps")
    .select("id, step_order, type, delay_days, delay_hours")
    .eq("sequence_id", SEQUENCE_ID)
    .order("step_order");
  if (!steps || steps.length === 0) { console.error("No steps."); return; }

  const firstEmail = steps.find((s: any) => s.type === "email" && s.step_order === 1);
  const wait = steps.find((s: any) => s.type === "wait");
  if (!firstEmail || !wait) { console.error("Sequence shape unexpected."); return; }
  const stepsAfterWait = steps.filter((s: any) => s.step_order > wait.step_order);
  const idsAfterWait = stepsAfterWait.map((s: any) => s.id);

  const delayMs =
    (wait.delay_days ?? 0) * 86_400_000 + (wait.delay_hours ?? 0) * 3_600_000;
  console.log(`Wait step: ${wait.delay_days || 0}d ${wait.delay_hours || 0}h (${delayMs}ms)`);
  console.log(`Steps after wait: ${idsAfterWait.length}\n`);

  // 2. Find active enrollments past the wait step
  const { data: midFlight } = await sb
    .from("enrollments")
    .select("id, contact_id, current_step_id, next_run_at")
    .eq("sequence_id", SEQUENCE_ID)
    .eq("status", "active")
    .in("current_step_id", idsAfterWait);

  if (!midFlight || midFlight.length === 0) {
    console.log("No mid-flight enrollments. Nothing to do.");
    return;
  }
  console.log(`Mid-flight enrollments to rewind: ${midFlight.length}\n`);

  // 3. For each, find their step 01 send's sent_at
  const contactIds = midFlight.map((e: any) => e.contact_id);
  const { data: sends } = await sb
    .from("sends")
    .select("contact_id, sent_at")
    .eq("sequence_id", SEQUENCE_ID)
    .eq("sequence_step_id", firstEmail.id)
    .in("contact_id", contactIds);
  const sentAtByContact: Record<string, string> = {};
  for (const s of sends || []) {
    if (s.sent_at && (!sentAtByContact[s.contact_id] || s.sent_at > sentAtByContact[s.contact_id])) {
      sentAtByContact[s.contact_id] = s.sent_at;
    }
  }

  // 4. Build update plan
  type Plan = { id: string; contact_id: string; from_step: string; to_step: string; new_next_run_at: string };
  const plans: Plan[] = [];
  let missingSent = 0;
  for (const e of midFlight) {
    const sentAt = sentAtByContact[e.contact_id];
    if (!sentAt) { missingSent++; continue; }
    const newNextRun = new Date(new Date(sentAt).getTime() + delayMs).toISOString();
    plans.push({
      id: e.id,
      contact_id: e.contact_id,
      from_step: e.current_step_id,
      to_step: wait.id,
      new_next_run_at: newNextRun,
    });
  }

  console.log(`Plans (${plans.length}):`);
  for (const p of plans.slice(0, 5)) {
    console.log(`  ${p.id.slice(0, 8)}…  contact=${p.contact_id.slice(0, 8)}…  → wait, next_run=${p.new_next_run_at}`);
  }
  if (plans.length > 5) console.log(`  … and ${plans.length - 5} more`);
  if (missingSent) console.log(`\n  Skipped ${missingSent} (no step 01 send found)`);

  if (!apply) {
    console.log("\n\x1b[33mDry-run complete. Re-run with --apply to commit.\x1b[0m\n");
    return;
  }

  console.log("\n\x1b[31mApplying...\x1b[0m");
  let ok = 0;
  for (const p of plans) {
    const { error } = await sb
      .from("enrollments")
      .update({ current_step_id: p.to_step, next_run_at: p.new_next_run_at })
      .eq("id", p.id);
    if (error) console.error(`  ✗ ${p.id.slice(0, 8)}: ${error.message}`);
    else ok++;
  }
  console.log(`\n\x1b[32m✓ Rewound ${ok}/${plans.length} enrollments to wait.\x1b[0m\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
