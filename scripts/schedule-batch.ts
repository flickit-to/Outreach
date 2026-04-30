// Schedule the next batch of step-01 sends to fire at a specific Sydney time.
// Sets next_run_at on all active step-01 enrollments to the target instant
// so the cron picks them up at that exact tick.
//
// Run:
//   npx tsx --env-file=.env.production.local scripts/schedule-batch.ts          # dry-run
//   npx tsx --env-file=.env.production.local scripts/schedule-batch.ts --apply

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const SEQUENCE_ID = "126b442b-d806-4f7f-91c1-dae335c083d0";
// Target: 1 May 2026, 09:30 Sydney (AEST = UTC+10 in May, no DST)
//   → 2026-04-30T23:30:00.000Z
const TARGET_ISO = "2026-04-30T23:30:00.000Z";
const apply = process.argv.includes("--apply");

async function main() {
  console.log(`\nMode: ${apply ? "\x1b[31mAPPLY\x1b[0m" : "\x1b[32mDRY-RUN\x1b[0m"}`);
  console.log(`Target send time: ${TARGET_ISO}  (= 2026-05-01 09:30 AEST Sydney)\n`);

  // First email step
  const { data: emailSteps } = await sb
    .from("sequence_steps")
    .select("id, step_order, subject")
    .eq("sequence_id", SEQUENCE_ID)
    .eq("type", "email")
    .order("step_order");
  const firstEmail = emailSteps?.[0];
  if (!firstEmail) { console.error("No email step."); return; }
  console.log(`First email step: order=${firstEmail.step_order}  subject="${firstEmail.subject}"\n`);

  // Active enrollments at step 01 (regardless of current next_run_at)
  const { data: enrolls } = await sb
    .from("enrollments")
    .select("id, contact_id, next_run_at")
    .eq("sequence_id", SEQUENCE_ID)
    .eq("status", "active")
    .eq("current_step_id", firstEmail.id);

  console.log(`Step-01 active enrollments: ${enrolls?.length || 0}`);
  if (!enrolls || enrolls.length === 0) {
    console.log("Nothing to schedule.");
    return;
  }

  console.log(`\nWill set their next_run_at = ${TARGET_ISO}`);
  console.log(`(Daily cap is 30 per sender — first 30 fire at 09:30 AEST,`);
  console.log(` remaining ${Math.max(0, enrolls.length - 30)} defer to next send day's 09:00 window.)`);

  if (!apply) {
    console.log("\n\x1b[33mDry-run complete. Re-run with --apply to commit.\x1b[0m\n");
    return;
  }

  console.log("\n\x1b[31mApplying...\x1b[0m");
  const ids = enrolls.map((e: any) => e.id);
  let updated = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { error } = await sb
      .from("enrollments")
      .update({ next_run_at: TARGET_ISO })
      .in("id", batch);
    if (error) console.error(`  ✗`, error);
    else updated += batch.length;
  }
  console.log(`\n\x1b[32m✓ Scheduled ${updated} enrollments for ${TARGET_ISO}.\x1b[0m\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
