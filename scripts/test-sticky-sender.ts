// End-to-end sticky-sender test on STAGING.
//
// Asserts the sequence engine respects contact.assigned_sender_id under five
// scenarios. Cleans up its own test data on every run (idempotent).
//
// Run with:
//   npx tsx --env-file=.env.staging.local scripts/test-sticky-sender.ts

import { createClient } from "@supabase/supabase-js";
import { runEnrollmentTick } from "../src/lib/engine/run-sequence-tick";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("Missing staging env vars.");
  process.exit(1);
}
const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_EMAIL = "ryan@klickflow.io";
const PREFIX = "stickytest_";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(name: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  pass++;
}
function bad(name: string, detail: string) {
  console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${detail}`);
  failures.push(`${name} — ${detail}`);
  fail++;
}

async function getUser() {
  const { data } = await sb.auth.admin.listUsers({ perPage: 200 });
  const u = data?.users?.find((x) => x.email === TEST_EMAIL);
  if (!u) throw new Error(`No staging user ${TEST_EMAIL}`);
  return u.id;
}

async function cleanup(userId: string) {
  const { data: testContacts } = await sb
    .from("contacts")
    .select("id")
    .eq("user_id", userId)
    .like("email", `${PREFIX}%`);
  const contactIds = (testContacts || []).map((c) => c.id);
  if (contactIds.length) {
    await sb.from("sends").delete().in("contact_id", contactIds);
    await sb.from("contacts").delete().in("id", contactIds);
  }
  const { data: testSenders } = await sb
    .from("sender_emails")
    .select("id")
    .eq("user_id", userId)
    .like("email", `${PREFIX}%`);
  const senderIds = (testSenders || []).map((s) => s.id);
  if (senderIds.length) await sb.from("sender_emails").delete().in("id", senderIds);
  const { data: testSequences } = await sb
    .from("sequences")
    .select("id")
    .eq("user_id", userId)
    .like("name", `${PREFIX}%`);
  const seqIds = (testSequences || []).map((s) => s.id);
  if (seqIds.length) await sb.from("sequences").delete().in("id", seqIds);
}

async function setupSenders(userId: string, dailyLimit = 50) {
  const { data: s1 } = await sb
    .from("sender_emails")
    .insert({
      user_id: userId,
      email: `${PREFIX}sender_a@example.com`,
      name: "Sender A",
      daily_limit: dailyLimit,
    })
    .select()
    .single();
  const { data: s2 } = await sb
    .from("sender_emails")
    .insert({
      user_id: userId,
      email: `${PREFIX}sender_b@example.com`,
      name: "Sender B",
      daily_limit: dailyLimit,
    })
    .select()
    .single();
  return { s1: s1!, s2: s2! };
}

async function setupContact(
  userId: string,
  email: string,
  assignedSenderId: string | null = null,
) {
  const { data } = await sb
    .from("contacts")
    .insert({
      user_id: userId,
      email: `${PREFIX}${email}`,
      first_name: "Test",
      last_name: email,
      lead_stage: "new_lead",
      assigned_sender_id: assignedSenderId,
    })
    .select()
    .single();
  return data!;
}

async function setupSequence(
  userId: string,
  name: string,
  fromEmailId: string | null = null,
) {
  const { data: seq } = await sb
    .from("sequences")
    .insert({
      user_id: userId,
      name: `${PREFIX}${name}`,
      status: "active",
      from_email_id: fromEmailId,
      send_days: [0, 1, 2, 3, 4, 5, 6], // ignore send_days for test
    })
    .select()
    .single();
  const { data: step } = await sb
    .from("sequence_steps")
    .insert({
      sequence_id: seq!.id,
      step_order: 1,
      type: "email",
      subject: "Test subject",
      body: "Hi {{first_name}}, test body.",
    })
    .select()
    .single();
  return { sequence: seq!, step: step! };
}

async function enrollAndTick(sequenceId: string, contactId: string, stepId: string) {
  const { data: enrollment } = await sb
    .from("enrollments")
    .insert({
      sequence_id: sequenceId,
      contact_id: contactId,
      current_step_id: stepId,
      status: "active",
      next_run_at: new Date().toISOString(),
    })
    .select()
    .single();
  const result = await runEnrollmentTick(enrollment as never, sb);
  return { enrollment: enrollment!, result };
}

async function getLastSend(contactId: string) {
  const { data } = await sb
    .from("sends")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function backfillSendsForCapacity(senderId: string, count: number) {
  // Insert N "sent" rows in the last hour to push sender to its daily limit.
  const userId = (await sb.auth.admin.listUsers({ perPage: 200 })).data?.users?.[0]?.id;
  // We need a valid contact_id and user_id for FK, so use an existing test contact.
  const { data: anyContact } = await sb
    .from("contacts")
    .select("id, user_id")
    .like("email", `${PREFIX}%`)
    .limit(1)
    .maybeSingle();
  if (!anyContact) throw new Error("No test contact for backfill");
  const rows = Array.from({ length: count }, () => ({
    user_id: anyContact.user_id,
    contact_id: anyContact.id,
    sender_email_id: senderId,
    from_email_address: "filler@example.com",
    status: "sent",
    sent_at: new Date().toISOString(),
  }));
  await sb.from("sends").insert(rows);
}

async function main() {
  const userId = await getUser();
  console.log(`\nUser: ${TEST_EMAIL} (${userId.slice(0, 8)}…)\n`);
  await cleanup(userId);

  // ─── Test 1: Sticky enforcement ─────────────────────────────────────────
  console.log("Test 1 — Sticky sender beats sequence preference");
  {
    const { s1, s2 } = await setupSenders(userId);
    // Contact pre-assigned to S1
    const cA = await setupContact(userId, "alice", s1.id);
    // Sequence prefers S2
    const { sequence, step } = await setupSequence(userId, "seq_t1", s2.id);
    const { result } = await enrollAndTick(sequence.id, cA.id, step.id);
    const send = await getLastSend(cA.id);
    if (result.kind !== "step_advanced" && result.kind !== "completed") {
      bad("T1.1 enrollment processed (advanced or completed)", `got ${result.kind} (${(result as any).reason || ""})`);
    } else ok(`T1.1 enrollment processed (${result.kind})`);
    if (send?.sender_email_id === s1.id) ok("T1.2 send used STICKY sender (S1)");
    else bad("T1.2 send used STICKY sender (S1)", `got sender_email_id=${send?.sender_email_id}, expected ${s1.id}`);
    if (send?.from_email_address === s1.email) ok("T1.3 from_email_address = S1");
    else bad("T1.3 from_email_address = S1", `got ${send?.from_email_address}`);
  }

  await cleanup(userId);

  // ─── Test 2: New contact assigned to sequence's preferred sender ────────
  console.log("\nTest 2 — Fresh contact + sequence with from_email_id picks that sender + sticks it");
  {
    const { s1, s2 } = await setupSenders(userId);
    const cB = await setupContact(userId, "bob", null);
    const { sequence, step } = await setupSequence(userId, "seq_t2", s2.id);
    const { result } = await enrollAndTick(sequence.id, cB.id, step.id);
    const send = await getLastSend(cB.id);
    const { data: refreshed } = await sb.from("contacts").select("assigned_sender_id").eq("id", cB.id).single();
    if (result.kind !== "step_advanced" && result.kind !== "completed")
      bad("T2.1 enrollment processed", `got ${result.kind}`);
    else ok(`T2.1 enrollment processed (${result.kind})`);
    if (send?.sender_email_id === s2.id) ok("T2.2 send used sequence's preferred sender (S2)");
    else bad("T2.2 send used sequence's preferred sender", `got ${send?.sender_email_id}, expected ${s2.id}`);
    if (refreshed?.assigned_sender_id === s2.id)
      ok("T2.3 contact now sticky-assigned to S2");
    else bad("T2.3 contact now sticky-assigned to S2", `assigned_sender_id=${refreshed?.assigned_sender_id}`);
    void s1;
  }

  await cleanup(userId);

  // ─── Test 3: Multiple sequences honor the sticky lock ───────────────────
  console.log("\nTest 3 — Contact locked to S1 from sequence #1 stays on S1 in sequence #2 (which prefers S2)");
  {
    const { s1, s2 } = await setupSenders(userId);
    const cC = await setupContact(userId, "carol", null);
    // Sequence 1: prefers S1
    const { sequence: seq1, step: step1 } = await setupSequence(userId, "seq_t3a", s1.id);
    await enrollAndTick(seq1.id, cC.id, step1.id);
    const { data: afterFirst } = await sb.from("contacts").select("assigned_sender_id").eq("id", cC.id).single();
    if (afterFirst?.assigned_sender_id === s1.id) ok("T3.1 first sequence assigns S1");
    else bad("T3.1 first sequence assigns S1", `assigned=${afterFirst?.assigned_sender_id}`);

    // Sequence 2: prefers S2 — but Carol is already locked to S1
    const { sequence: seq2, step: step2 } = await setupSequence(userId, "seq_t3b", s2.id);
    const { result } = await enrollAndTick(seq2.id, cC.id, step2.id);
    if (result.kind !== "step_advanced" && result.kind !== "completed")
      bad("T3.2 sequence #2 processed", `got ${result.kind}`);
    else ok(`T3.2 sequence #2 processed (${result.kind})`);
    const sends = await sb
      .from("sends")
      .select("sender_email_id, sequence_id")
      .eq("contact_id", cC.id)
      .order("created_at", { ascending: true });
    const allFromS1 = (sends.data || []).every((s) => s.sender_email_id === s1.id);
    if (allFromS1 && (sends.data?.length || 0) === 2)
      ok(`T3.3 BOTH sends came from S1 (sticky lock held across sequences)`);
    else
      bad(
        `T3.3 BOTH sends came from S1`,
        `got ${(sends.data || []).map((s) => s.sender_email_id?.slice(0, 8)).join(", ")}`,
      );
  }

  await cleanup(userId);

  // ─── Test 4: Sticky sender at capacity → defer (NOT fall through) ───────
  console.log("\nTest 4 — Sticky sender at daily limit → enrollment defers, no send to a different sender");
  {
    const { s1, s2 } = await setupSenders(userId, 2); // tiny limit so we can fill it
    const cD = await setupContact(userId, "dave", s1.id);
    // Need a contact for the backfill FK target — use cD.
    // Pre-fill S1 to its limit by inserting 2 sent rows in the last hour.
    await sb.from("sends").insert([
      {
        user_id: userId,
        contact_id: cD.id,
        sender_email_id: s1.id,
        from_email_address: s1.email,
        status: "sent",
        sent_at: new Date().toISOString(),
      },
      {
        user_id: userId,
        contact_id: cD.id,
        sender_email_id: s1.id,
        from_email_address: s1.email,
        status: "sent",
        sent_at: new Date().toISOString(),
      },
    ]);

    // Now run a sequence (no preference) on Dave — sticky S1 should defer
    const { sequence, step } = await setupSequence(userId, "seq_t4", null);
    const { result } = await enrollAndTick(sequence.id, cD.id, step.id);
    if (result.kind === "deferred" && (result as any).reason === "sticky_sender_at_capacity")
      ok("T4.1 enrollment deferred with reason=sticky_sender_at_capacity");
    else bad("T4.1 enrollment deferred with reason=sticky_sender_at_capacity", `got ${JSON.stringify(result)}`);

    // Verify NO send was created from S2 (the alternative)
    const { data: dSends } = await sb.from("sends").select("sender_email_id").eq("contact_id", cD.id);
    const usedAnyS2 = (dSends || []).some((s) => s.sender_email_id === s2.id);
    if (!usedAnyS2) ok("T4.2 no send was made from S2 (the alternative was correctly avoided)");
    else bad("T4.2 no send from S2", `found send to S2 — sticky was bypassed!`);
  }

  await cleanup(userId);

  // ─── Test 5: Sticky sender deleted → re-pick (graceful recovery) ────────
  console.log("\nTest 5 — Sticky sender deleted out from under us → re-pick from remaining senders");
  {
    const { s1, s2 } = await setupSenders(userId);
    const cE = await setupContact(userId, "eve", s1.id);
    // Delete S1 — FK is on delete set null, so Eve.assigned_sender_id becomes null
    await sb.from("sender_emails").delete().eq("id", s1.id);
    const { data: afterDelete } = await sb
      .from("contacts")
      .select("assigned_sender_id")
      .eq("id", cE.id)
      .single();
    if (afterDelete?.assigned_sender_id === null) ok("T5.0 sticky cleared by FK on_delete");
    else bad("T5.0 sticky cleared by FK on_delete", `still ${afterDelete?.assigned_sender_id}`);

    const { sequence, step } = await setupSequence(userId, "seq_t5", null);
    const { result } = await enrollAndTick(sequence.id, cE.id, step.id);
    if (result.kind !== "step_advanced" && result.kind !== "completed")
      bad("T5.1 enrollment processed after sticky cleared", `got ${result.kind}`);
    else ok(`T5.1 enrollment processed after sticky cleared (${result.kind})`);
    const send = await getLastSend(cE.id);
    if (send?.sender_email_id === s2.id) ok("T5.2 fell back to S2 (the only remaining sender)");
    else bad("T5.2 fell back to S2", `got sender_email_id=${send?.sender_email_id}`);
  }

  await cleanup(userId);

  // ─── Summary ────────────────────────────────────────────────────────────
  console.log(`\n${"━".repeat(60)}`);
  console.log(`Result: \x1b[32m${pass} passed\x1b[0m, ${fail > 0 ? `\x1b[31m${fail} failed\x1b[0m` : "0 failed"}`);
  console.log("━".repeat(60));
  if (fail > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Test threw:", e);
  process.exit(1);
});
