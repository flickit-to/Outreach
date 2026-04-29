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
    const now = new Date().toISOString();
    const { count } = await sb
      .from("enrollments")
      .update({ next_run_at: now }, { count: "exact" })
      .eq("sequence_id", SEQUENCE_ID)
      .eq("status", "active")
      .gt("next_run_at", now);
    console.log(`\nReset ${count || 0} active+deferred enrollments to next_run_at = now\n`);
  }

  console.log(`Ticking sequence ${SEQUENCE_ID} (max ${MAX_TICKS})\n`);

  const tally: Record<string, number> = {};
  for (let i = 0; i < MAX_TICKS; i++) {
    const { data: due } = await sb
      .from("enrollments")
      .select("*")
      .eq("sequence_id", SEQUENCE_ID)
      .eq("status", "active")
      .lte("next_run_at", new Date().toISOString())
      .order("next_run_at", { ascending: true })
      .limit(1);
    if (!due || due.length === 0) {
      console.log(`No more due enrollments after ${i} ticks.`);
      break;
    }
    try {
      const r = await runEnrollmentTick(due[0] as never, sb);
      const key = "reason" in r ? `${r.kind}:${r.reason}` : r.kind;
      tally[key] = (tally[key] || 0) + 1;
      if (i < 3 || i % 20 === 0) {
        console.log(`  tick ${i + 1}: ${key}`);
      }
    } catch (e: any) {
      tally["error"] = (tally["error"] || 0) + 1;
      console.error(`  tick ${i + 1}: ERROR — ${e.message}`);
    }
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
