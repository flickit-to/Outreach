// Backfill contacts.status from outbound activities so contacts you've
// already emailed via the new compose flow don't show "Not Contacted."
// Forward-only: never downgrades a higher state.

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const apply = process.argv.includes("--apply");

const RANK: Record<string, number> = {
  not_contacted: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
  bounced: 5, // terminal, don't overwrite
};

async function main() {
  console.log(`\nMode: ${apply ? "\x1b[31mAPPLY\x1b[0m" : "\x1b[32mDRY-RUN\x1b[0m"}\n`);

  // Pull every outbound activity, map to its contact's highest implied state
  const { data: acts } = await sb
    .from("activities")
    .select("contact_id, status, opened_at, clicked_at")
    .eq("direction", "outbound")
    .not("contact_id", "is", null);

  if (!acts) { console.log("no activities"); return; }

  const desired: Map<string, string> = new Map();
  for (const a of acts) {
    let s: string = "sent";
    if (a.clicked_at) s = "clicked";
    else if (a.opened_at) s = "opened";
    else if (a.status === "delivered") s = "delivered";
    else if (a.status === "opened") s = "opened";
    else if (a.status === "clicked") s = "clicked";
    else if (a.status === "bounced") s = "bounced";

    const prev = desired.get(a.contact_id);
    if (!prev || (RANK[s] || 0) > (RANK[prev] || 0)) desired.set(a.contact_id, s);
  }

  // Get current contact statuses
  const ids = Array.from(desired.keys());
  const { data: contacts } = await sb
    .from("contacts")
    .select("id, status")
    .in("id", ids);
  if (!contacts) return;

  type Plan = { id: string; from: string; to: string };
  const plans: Plan[] = [];
  for (const c of contacts) {
    const wanted = desired.get(c.id)!;
    const cur = c.status || "not_contacted";
    if ((RANK[wanted] || 0) > (RANK[cur] || 0)) {
      plans.push({ id: c.id, from: cur, to: wanted });
    }
  }
  console.log(`Contacts to bump: ${plans.length}\n`);

  // Summarize transitions
  const byKey: Record<string, number> = {};
  for (const p of plans) {
    const k = `${p.from} → ${p.to}`;
    byKey[k] = (byKey[k] || 0) + 1;
  }
  for (const [k, n] of Object.entries(byKey).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(3)}  ${k}`);
  }

  if (!apply) {
    console.log("\n\x1b[33mDry-run complete. Re-run with --apply to commit.\x1b[0m\n");
    return;
  }

  // Group by target status for batch updates
  const byTarget = new Map<string, string[]>();
  for (const p of plans) {
    const arr = byTarget.get(p.to) || [];
    arr.push(p.id);
    byTarget.set(p.to, arr);
  }
  let updated = 0;
  for (const [target, batch] of Array.from(byTarget.entries())) {
    const { error } = await sb
      .from("contacts")
      .update({ status: target })
      .in("id", batch);
    if (error) console.error(`  ✗ "${target}":`, error.message);
    else updated += batch.length;
  }
  console.log(`\n\x1b[32m✓ Updated ${updated}/${plans.length} contacts.\x1b[0m\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
