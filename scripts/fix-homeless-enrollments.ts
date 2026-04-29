// One-shot fix: re-anchor active enrollments whose current_step_id is NULL to
// the sequence's first step, and reset next_run_at = now so they're due.
//
// Cause: editing a sequence calls "delete all sequence_steps" then re-inserts.
// The FK on enrollments.current_step_id is `on delete set null`, so existing
// enrollments survive but become homeless. activateSequence() only enrols NEW
// contacts; it doesn't fix the homeless ones.
//
// Run:
//   npx tsx --env-file=.env.production.local scripts/fix-homeless-enrollments.ts          # dry-run
//   npx tsx --env-file=.env.production.local scripts/fix-homeless-enrollments.ts --apply

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const apply = process.argv.includes("--apply");
const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SEQUENCE_ID = "126b442b-d806-4f7f-91c1-dae335c083d0";

async function main() {
  console.log(`\nMode: ${apply ? "\x1b[31mAPPLY\x1b[0m" : "\x1b[32mDRY-RUN\x1b[0m"}`);
  console.log(`Sequence: ${SEQUENCE_ID}\n`);

  const { data: firstStep } = await sb
    .from("sequence_steps")
    .select("id, type, subject, step_order")
    .eq("sequence_id", SEQUENCE_ID)
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!firstStep) {
    console.error("No first step — abort.");
    process.exit(1);
  }
  console.log(`First step: order=${firstStep.step_order} type=${firstStep.type} id=${firstStep.id}`);
  if (firstStep.type !== "email") {
    console.error("First step is not 'email' — abort to be safe.");
    process.exit(1);
  }

  const { data: homeless } = await sb
    .from("enrollments")
    .select("id, contact_id, status, current_step_id, next_run_at")
    .eq("sequence_id", SEQUENCE_ID)
    .eq("status", "active")
    .is("current_step_id", null);

  console.log(`\nHomeless active enrollments to re-anchor: ${homeless?.length || 0}`);

  if (!homeless || homeless.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (!apply) {
    console.log("\nFirst 5 sample IDs:");
    for (const e of homeless.slice(0, 5)) console.log(`  - ${e.id}  contact=${e.contact_id}  next_run_at=${e.next_run_at}`);
    console.log(`\n\x1b[33mDry-run complete. Re-run with --apply to commit.\x1b[0m\n`);
    return;
  }

  const now = new Date().toISOString();
  const ids = homeless.map((e: any) => e.id);
  let updated = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { error } = await sb
      .from("enrollments")
      .update({ current_step_id: firstStep.id, next_run_at: now })
      .in("id", batch);
    if (error) {
      console.error(`  ✗ batch ${i}:`, error);
    } else {
      updated += batch.length;
    }
  }
  console.log(`\n\x1b[32m✓ Re-anchored ${updated}/${ids.length} enrollments to step 1.\x1b[0m`);
  console.log(`Next: activate the sequence in the UI (Resume button), then run the engine.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
