// Backfill assigned_sender_id on contacts based on their historical sends.
//
// What it does:
//   1. Ensures ryan.sri@klickflow.io exists as a sender_emails row (creates if missing)
//   2. For every contact (of the target user) with no current assigned_sender_id
//      but at least one prior send, looks at the MOST RECENT send and assigns
//      the contact to the corresponding sender:
//        - from_email_address = ryan.sri@klickflow.io  →  new ryan.sri sender_emails row
//        - from_email_address = ryans@klickflow.io     →  existing ryans sender_emails row
//        - from_email_address = ryansri@klickflow.io   →  existing ryansri sender_emails row
//        - from_email_address = null (old send)        →  new ryan.sri sender_emails row
//                                                          (per user's call: assume default)
//        - any other address                            →  skipped (printed as warning)
//
// Skipped (intentionally):
//   - Contacts that ALREADY have assigned_sender_id (sticky already set, never overwrite)
//   - Contacts with NO prior sends (truly fresh — let auto-rotate pick on first send)
//
// Scope flag:
//   --scope=list    only the "Follow up email sequence" list (116 contacts)
//   --scope=user    ALL contacts owned by that user (default — matches global sticky rule)
//
// Safety:
//   Dry-run by default. Prints the full plan and exits. Pass --apply to write.
//
// Run:
//   npx tsx --env-file=.env.production.local scripts/backfill-sticky-senders.ts
//   npx tsx --env-file=.env.production.local scripts/backfill-sticky-senders.ts --scope=list
//   npx tsx --env-file=.env.production.local scripts/backfill-sticky-senders.ts --apply

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("Missing prod env vars");
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const scopeArg = args.find((a) => a.startsWith("--scope="))?.split("=")[1] ?? "user";
if (scopeArg !== "user" && scopeArg !== "list") {
  console.error(`Invalid --scope=${scopeArg}. Use --scope=user or --scope=list.`);
  process.exit(1);
}

const LIST_NAME = "Follow up email sequence";
const DEFAULT_EMAIL = "ryan.sri@klickflow.io";
const DEFAULT_NAME = "Ryan Sri";
const DEFAULT_DAILY_LIMIT = 20;

const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`\nProd: ${url}`);
  console.log(`Mode: ${apply ? "\x1b[31mAPPLY (writes will happen)\x1b[0m" : "\x1b[32mDRY-RUN (no writes)\x1b[0m"}`);
  console.log(`Scope: ${scopeArg}\n`);

  // 1. Find list + user
  const { data: list } = await sb
    .from("contact_lists")
    .select("id, name, user_id")
    .ilike("name", `%${LIST_NAME}%`)
    .maybeSingle();
  if (!list) {
    console.error(`No list matching "${LIST_NAME}"`);
    process.exit(1);
  }
  const userId = list.user_id;
  console.log(`User: ${userId}`);
  console.log(`List: ${list.name} (${list.id})\n`);

  // 2. Ensure default sender exists in sender_emails
  let { data: defaultSender } = await sb
    .from("sender_emails")
    .select("id, email, name, daily_limit")
    .eq("user_id", userId)
    .eq("email", DEFAULT_EMAIL)
    .maybeSingle();

  if (!defaultSender) {
    console.log(`sender_emails row for ${DEFAULT_EMAIL} does not exist.`);
    if (apply) {
      const { data: created, error } = await sb
        .from("sender_emails")
        .insert({
          user_id: userId,
          email: DEFAULT_EMAIL,
          name: DEFAULT_NAME,
          daily_limit: DEFAULT_DAILY_LIMIT,
        })
        .select()
        .single();
      if (error || !created) {
        console.error("Failed to insert default sender:", error);
        process.exit(1);
      }
      defaultSender = created;
      console.log(`  ✓ Created sender_emails row id=${created.id}\n`);
    } else {
      console.log(`  → Plan: insert with name="${DEFAULT_NAME}", daily_limit=${DEFAULT_DAILY_LIMIT}\n`);
      defaultSender = {
        id: "<NEW-ROW-ID>",
        email: DEFAULT_EMAIL,
        name: DEFAULT_NAME,
        daily_limit: DEFAULT_DAILY_LIMIT,
      } as any;
    }
  } else {
    console.log(`sender_emails row for ${DEFAULT_EMAIL} already exists (id=${defaultSender.id})\n`);
  }

  // 3. Pull pool (resolve other addresses)
  const { data: pool } = await sb
    .from("sender_emails")
    .select("id, email")
    .eq("user_id", userId);
  const senderIdByEmail: Record<string, string> = {};
  for (const s of pool || []) senderIdByEmail[s.email.toLowerCase()] = s.id;
  // Always map the default email to *something* so dry-run categorizes correctly.
  // In dry-run when the row doesn't exist yet, this is a placeholder id; in apply mode
  // it's the freshly-created row id.
  senderIdByEmail[DEFAULT_EMAIL.toLowerCase()] = defaultSender!.id;

  console.log("Sender pool (after ensuring default):");
  for (const e of Object.keys(senderIdByEmail)) {
    console.log(`  - ${e}  →  ${senderIdByEmail[e]}`);
  }
  console.log("");

  // 4. Resolve contact set
  let contactIds: string[];
  if (scopeArg === "list") {
    const { data: members } = await sb
      .from("list_contacts")
      .select("contact_id")
      .eq("list_id", list.id);
    contactIds = (members || []).map((m: any) => m.contact_id);
  } else {
    const { data: allContacts } = await sb
      .from("contacts")
      .select("id")
      .eq("user_id", userId);
    contactIds = (allContacts || []).map((c: any) => c.id);
  }
  console.log(`Contacts in scope: ${contactIds.length}\n`);

  // 5. Pull contact rows + filter to those without sticky already
  const { data: contacts } = await sb
    .from("contacts")
    .select("id, email, assigned_sender_id")
    .in("id", contactIds);

  const eligible = (contacts || []).filter((c: any) => !c.assigned_sender_id);
  const alreadySticky = (contacts || []).length - eligible.length;
  console.log(`  Already sticky (skipped):  ${alreadySticky}`);
  console.log(`  Eligible for backfill:     ${eligible.length}\n`);

  if (eligible.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // 6. For each eligible contact, find the MOST RECENT send and pick target sender.
  //    Pull sends in batches to avoid huge IN clauses.
  const eligibleIds = eligible.map((c: any) => c.id);
  const lastSendByContact: Record<string, { addr: string | null; sent_at: string }> = {};

  const BATCH = 200;
  for (let i = 0; i < eligibleIds.length; i += BATCH) {
    const batch = eligibleIds.slice(i, i + BATCH);
    const { data: sends } = await sb
      .from("sends")
      .select("contact_id, from_email_address, sent_at, status")
      .in("contact_id", batch)
      .in("status", ["sent", "delivered", "opened", "clicked", "replied"])
      .order("sent_at", { ascending: false });
    for (const s of sends || []) {
      if (!lastSendByContact[s.contact_id]) {
        lastSendByContact[s.contact_id] = {
          addr: s.from_email_address,
          sent_at: s.sent_at,
        };
      }
    }
  }

  // 7. Categorize
  type Plan = { contactId: string; email: string; targetSenderId: string; reason: string };
  const plan: Plan[] = [];
  const skipped: { contactId: string; email: string; reason: string }[] = [];
  const noSends: string[] = [];
  const unknownAddr: Record<string, number> = {};

  const defaultSenderId =
    defaultSender && defaultSender.id !== "<NEW-ROW-ID>"
      ? defaultSender.id
      : "<NEW-ROW-ID>";

  for (const c of eligible) {
    const last = lastSendByContact[c.id];
    if (!last) {
      noSends.push(c.id);
      continue;
    }
    const addr = (last.addr || "").toLowerCase();
    if (!last.addr) {
      // null from_email_address (old sends) → assume default per user's call
      plan.push({
        contactId: c.id,
        email: c.email,
        targetSenderId: defaultSenderId,
        reason: "null_addr_assumed_default",
      });
      continue;
    }
    const senderId = senderIdByEmail[addr];
    if (senderId) {
      plan.push({
        contactId: c.id,
        email: c.email,
        targetSenderId: senderId,
        reason: `matched:${addr}`,
      });
    } else {
      unknownAddr[addr] = (unknownAddr[addr] || 0) + 1;
      skipped.push({ contactId: c.id, email: c.email, reason: `unknown_addr:${addr}` });
    }
  }

  // 8. Summarize plan
  const byTarget: Record<string, number> = {};
  for (const p of plan) {
    const label =
      p.targetSenderId === defaultSenderId
        ? `${DEFAULT_EMAIL} (default)`
        : Object.entries(senderIdByEmail).find(([_, id]) => id === p.targetSenderId)?.[0] ||
          p.targetSenderId;
    byTarget[label] = (byTarget[label] || 0) + 1;
  }

  console.log("Backfill plan:");
  for (const [label, n] of Object.entries(byTarget).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(4)} →  ${label}`);
  }
  console.log("");
  console.log(`Contacts left untouched (no prior sends):  ${noSends.length}`);
  console.log(`Contacts skipped (unknown sender addr):    ${skipped.length}`);
  if (Object.keys(unknownAddr).length > 0) {
    console.log("  Unknown addresses encountered:");
    for (const [a, n] of Object.entries(unknownAddr)) {
      console.log(`    ${n.toString().padStart(4)}  ${a}`);
    }
  }
  console.log("");

  // 9. Reason breakdown (sanity)
  const byReason: Record<string, number> = {};
  for (const p of plan) byReason[p.reason] = (byReason[p.reason] || 0) + 1;
  console.log("By reason:");
  for (const [r, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(4)}  ${r}`);
  }
  console.log("");

  if (!apply) {
    console.log("\x1b[33mDry-run complete. Re-run with --apply to commit.\x1b[0m\n");
    return;
  }

  // 10. Apply
  console.log("\x1b[31mApplying writes...\x1b[0m");
  let updated = 0;
  for (let i = 0; i < plan.length; i += 50) {
    const chunk = plan.slice(i, i + 50);
    // Group by target — single update per group
    const byTargetMap: Record<string, string[]> = {};
    for (const p of chunk) (byTargetMap[p.targetSenderId] ||= []).push(p.contactId);
    for (const [targetId, ids] of Object.entries(byTargetMap)) {
      const { error } = await sb
        .from("contacts")
        .update({ assigned_sender_id: targetId })
        .in("id", ids);
      if (error) {
        console.error(`  ✗ Failed batch (target=${targetId}):`, error);
      } else {
        updated += ids.length;
      }
    }
  }
  console.log(`\n\x1b[32m✓ Updated ${updated}/${plan.length} contacts.\x1b[0m\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
