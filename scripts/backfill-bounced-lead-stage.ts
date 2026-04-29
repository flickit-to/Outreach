// Backfill: set lead_stage="bounced" on every contact that has at least one
// bounced send. Doesn't overwrite terminal states (replied, meeting_booked,
// closed_won, closed_lost).
//
// Run:
//   npx tsx --env-file=.env.production.local scripts/backfill-bounced-lead-stage.ts          # dry-run
//   npx tsx --env-file=.env.production.local scripts/backfill-bounced-lead-stage.ts --apply  # commit

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("Missing env vars");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const PROTECTED = ["replied", "meeting_booked", "closed_won", "closed_lost"];

const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`\nDB: ${url}`);
  console.log(`Mode: ${apply ? "\x1b[31mAPPLY\x1b[0m" : "\x1b[32mDRY-RUN\x1b[0m"}\n`);

  // Find all bounced sends and get their contact_ids
  const bouncedContactIds = new Set<string>();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from("sends")
      .select("contact_id")
      .eq("status", "bounced")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) if (row.contact_id) bouncedContactIds.add(row.contact_id);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Distinct contacts with at least one bounced send: ${bouncedContactIds.size}`);

  if (bouncedContactIds.size === 0) {
    console.log("Nothing to do.");
    return;
  }

  // Pull those contact rows
  const ids = Array.from(bouncedContactIds);
  const contacts: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const { data } = await sb
      .from("contacts")
      .select("id, email, lead_stage, user_id")
      .in("id", batch);
    if (data) contacts.push(...data);
  }

  // Categorize
  const alreadyBounced = contacts.filter((c) => c.lead_stage === "bounced");
  const protectedTerminal = contacts.filter((c) => PROTECTED.includes(c.lead_stage));
  const toUpdate = contacts.filter(
    (c) => c.lead_stage !== "bounced" && !PROTECTED.includes(c.lead_stage),
  );

  console.log(`  Already bounced (skip):              ${alreadyBounced.length}`);
  console.log(`  Protected terminal state (skip):     ${protectedTerminal.length}`);
  console.log(`  Will update to lead_stage=bounced:    ${toUpdate.length}\n`);

  if (toUpdate.length === 0) {
    console.log("Nothing to update.");
    return;
  }

  // Stage breakdown of contacts about to be updated
  const stageBreakdown: Record<string, number> = {};
  for (const c of toUpdate) {
    const k = c.lead_stage || "(null)";
    stageBreakdown[k] = (stageBreakdown[k] || 0) + 1;
  }
  console.log("Updates by current lead_stage:");
  for (const [s, n] of Object.entries(stageBreakdown).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(4)}  ${s} → bounced`);
  }
  console.log("");

  // Per-user breakdown
  const userBreakdown: Record<string, number> = {};
  for (const c of toUpdate) userBreakdown[c.user_id] = (userBreakdown[c.user_id] || 0) + 1;
  console.log("Updates by user_id:");
  for (const [u, n] of Object.entries(userBreakdown).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(4)}  ${u}`);
  }
  console.log("");

  if (!apply) {
    console.log("\x1b[33mDry-run complete. Re-run with --apply to commit.\x1b[0m\n");
    return;
  }

  console.log("\x1b[31mApplying...\x1b[0m");
  const updateIds = toUpdate.map((c) => c.id);
  let updated = 0;
  for (let i = 0; i < updateIds.length; i += 100) {
    const batch = updateIds.slice(i, i + 100);
    const { error } = await sb
      .from("contacts")
      .update({ lead_stage: "bounced" })
      .in("id", batch)
      .not("lead_stage", "in", `(${PROTECTED.join(",")})`);
    if (error) console.error("  ✗", error);
    else updated += batch.length;
  }
  console.log(`\n\x1b[32m✓ Updated ${updated}/${updateIds.length} contacts.\x1b[0m\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
