// Stability + engagement audit for the running sequence campaign.
//
// Reports:
//   - System health: senders, daily limits, schema, cron config
//   - Per-step engagement: for every step in the active sequence, show
//     sends → delivered → opened → clicked → replied → bounced
//   - Contact-level table for the most recent step
//
// Run:
//   npx tsx --env-file=.env.production.local scripts/health-audit.ts

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const SEQUENCE_ID = "126b442b-d806-4f7f-91c1-dae335c083d0";

async function main() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  HEALTH AUDIT — Follow up sequence");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Sequence + steps
  const { data: seq } = await sb
    .from("sequences")
    .select("id, name, status, send_days, list_id, from_email_id, user_id")
    .eq("id", SEQUENCE_ID)
    .maybeSingle();
  if (!seq) { console.error("Sequence not found"); return; }
  console.log(`Sequence: ${seq.name}`);
  console.log(`  status: ${seq.status}`);
  console.log(`  send_days: ${JSON.stringify(seq.send_days)}`);
  console.log(`  from_email_id: ${seq.from_email_id || "(auto-rotate)"}`);

  const { data: steps } = await sb
    .from("sequence_steps")
    .select("id, step_order, type, subject, send_as_reply, delay_days, triggers")
    .eq("sequence_id", SEQUENCE_ID)
    .order("step_order");

  // Sender pool
  const { data: senders } = await sb
    .from("sender_emails")
    .select("id, email, daily_limit")
    .eq("user_id", seq.user_id);
  console.log(`\nSenders (${senders?.length || 0}):`);
  for (const s of senders || []) console.log(`  ${s.email.padEnd(30)} daily_limit=${s.daily_limit}`);

  // Sticky distribution
  const { data: list } = await sb
    .from("list_contacts")
    .select("contact_id")
    .eq("list_id", seq.list_id);
  const contactIds = (list || []).map((r: any) => r.contact_id);
  const { data: contacts } = await sb
    .from("contacts")
    .select("id, lead_stage, assigned_sender_id")
    .in("id", contactIds);
  const stickyDist: Record<string, number> = {};
  const stageDist: Record<string, number> = {};
  for (const c of contacts || []) {
    const senderEmail =
      (senders || []).find((s: any) => s.id === c.assigned_sender_id)?.email ||
      "(unassigned — auto-rotate)";
    stickyDist[senderEmail] = (stickyDist[senderEmail] || 0) + 1;
    stageDist[c.lead_stage] = (stageDist[c.lead_stage] || 0) + 1;
  }
  console.log(`\nList contacts (${contactIds.length}):`);
  console.log("  By sticky sender:");
  for (const [e, n] of Object.entries(stickyDist).sort((a, b) => b[1] - a[1]))
    console.log(`    ${n.toString().padStart(4)}  ${e}`);
  console.log("  By lead_stage:");
  for (const [s, n] of Object.entries(stageDist).sort((a, b) => b[1] - a[1]))
    console.log(`    ${n.toString().padStart(4)}  ${s}`);

  // Enrollments
  const { data: enr } = await sb
    .from("enrollments")
    .select("status, next_run_at, current_step_id")
    .eq("sequence_id", SEQUENCE_ID);
  const enrByStatus: Record<string, number> = {};
  let dueNow = 0;
  let dueIn24h = 0;
  const stepDist: Record<string, number> = {};
  const now = Date.now();
  for (const e of enr || []) {
    enrByStatus[e.status] = (enrByStatus[e.status] || 0) + 1;
    if (e.status === "active") {
      const t = e.next_run_at ? new Date(e.next_run_at).getTime() : 0;
      if (t <= now) dueNow++;
      else if (t <= now + 24 * 3600 * 1000) dueIn24h++;
      const stepId = e.current_step_id || "(null)";
      stepDist[stepId] = (stepDist[stepId] || 0) + 1;
    }
  }
  console.log(`\nEnrollments (${enr?.length || 0}):`);
  for (const [k, v] of Object.entries(enrByStatus)) console.log(`  ${k}: ${v}`);
  console.log(`  active & due now:    ${dueNow}`);
  console.log(`  active & due in 24h: ${dueIn24h}`);
  console.log(`  active by step pointer:`);
  for (const [stepId, count] of Object.entries(stepDist)) {
    const step = (steps || []).find((s: any) => s.id === stepId);
    const label = step ? `step ${String(step.step_order).padStart(2, "0")} ${step.type}` : "(homeless / null)";
    console.log(`    ${count.toString().padStart(4)}  ${label}`);
  }

  // PER-STEP ENGAGEMENT
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ENGAGEMENT BY STEP");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const step of steps || []) {
    if (step.type !== "email") continue;
    const { data: sends } = await sb
      .from("sends")
      .select("status, opened_at, clicked_at, replied_at, bounced_at")
      .eq("sequence_step_id", step.id);
    const total = sends?.length || 0;
    const delivered = sends?.filter((s: any) => ["delivered", "opened", "clicked", "replied"].includes(s.status)).length || 0;
    const opened = sends?.filter((s: any) => s.opened_at || ["opened", "clicked"].includes(s.status)).length || 0;
    const clicked = sends?.filter((s: any) => s.clicked_at || s.status === "clicked").length || 0;
    const replied = sends?.filter((s: any) => s.replied_at || s.status === "replied").length || 0;
    const bounced = sends?.filter((s: any) => s.status === "bounced").length || 0;
    const failed = sends?.filter((s: any) => s.status === "failed").length || 0;
    const notOpened = total - opened - bounced - failed;

    console.log(`\nStep ${String(step.step_order).padStart(2, "0")}  EMAIL  "${step.subject}"`);
    console.log(`  Sent:        ${total}`);
    console.log(`  Delivered:   ${delivered}`);
    console.log(`  Opened:      ${opened}${total ? `  (${Math.round((opened / total) * 100)}%)` : ""}`);
    console.log(`  Clicked:     ${clicked}${total ? `  (${Math.round((clicked / total) * 100)}%)` : ""}`);
    console.log(`  Replied:     ${replied}${total ? `  (${Math.round((replied / total) * 100)}%)` : ""}`);
    console.log(`  Did NOT open:${notOpened}${total ? `  (${Math.round((notOpened / total) * 100)}%)` : ""}`);
    if (bounced) console.log(`  Bounced:     ${bounced}`);
    if (failed) console.log(`  Failed:      ${failed}`);
  }

  // Cron config
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  CRON STATUS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  See vercel.json — script can't introspect Vercel's cron config remotely.`);
  console.log("");
}
main().catch((e) => { console.error(e); process.exit(1); });
