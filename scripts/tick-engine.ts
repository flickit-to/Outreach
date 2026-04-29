// Manually tick due enrollments for one sequence by calling runEnrollmentTick
// directly. Mirrors what the cron endpoint does. Use to debug when the
// "Run engine now" button doesn't appear to do anything.
//
// Run:
//   npx tsx --env-file=.env.production.local scripts/tick-engine.ts

import { createClient } from "@supabase/supabase-js";
import { runEnrollmentTick } from "../src/lib/engine/run-sequence-tick";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const SEQUENCE_ID = "126b442b-d806-4f7f-91c1-dae335c083d0";
const MAX_TICKS = 50;

async function main() {
  console.log(`\nTicking sequence ${SEQUENCE_ID} (max ${MAX_TICKS})\n`);

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
      tally[r.kind] = (tally[r.kind] || 0) + 1;
      if (i < 5 || i % 10 === 0) {
        console.log(`  tick ${i + 1}: ${r.kind}${("reason" in r ? ` (${r.reason})` : "")}`);
      }
    } catch (e: any) {
      tally["error"] = (tally["error"] || 0) + 1;
      console.error(`  tick ${i + 1}: ERROR — ${e.message}`);
    }
  }

  console.log(`\nTally:`);
  for (const [k, v] of Object.entries(tally)) console.log(`  ${k}: ${v}`);

  const { count: sentCount } = await sb
    .from("sends")
    .select("*", { count: "exact", head: true })
    .eq("sequence_id", SEQUENCE_ID);
  console.log(`\nTotal sends now: ${sentCount}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
