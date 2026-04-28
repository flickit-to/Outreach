// Seeds the staging Supabase with a test login + a thin slice of prod data.
// Reads the most recent backup folder.  Idempotent: re-running picks up
// existing user / sender / list and tops up only what's missing.
//
// Run with:
//   node --env-file=.env.staging.local scripts/seed-staging.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing env vars");
  process.exit(1);
}
const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_EMAIL = "ryan@klickflow.io";
const PICK_COUNT = 10;

// ─── Find latest prod backup ──────────────────────────────────────────────
const backups = readdirSync("backups")
  .filter((d) => statSync(join("backups", d)).isDirectory())
  .sort();
if (!backups.length) {
  console.error("No prod backup found in ./backups");
  process.exit(1);
}
const dir = join("backups", backups[backups.length - 1]);
console.log(`Reading prod backup from: ${dir}\n`);

const readJson = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
const contactsAll = readJson("contacts.json");
const sendersAll = readJson("sender_emails.json");
const listsAll = readJson("contact_lists.json");
const settingsAll = readJson("settings.json");

// ─── 1. Get-or-create the auth user ───────────────────────────────────────
console.log(`① Auth user: ${TEST_EMAIL}`);
let userId;
let printedPassword = null;

const { data: existingList } = await sb.auth.admin.listUsers({ perPage: 200 });
const existing = existingList?.users?.find((u) => u.email === TEST_EMAIL);

if (existing) {
  userId = existing.id;
  console.log(`   ✓ Already exists. id=${userId.slice(0, 8)}…`);
  console.log(`   (password unchanged — use what you set last time, or reset via Supabase dashboard)`);
} else {
  printedPassword = `staging-${randomBytes(4).toString("hex")}`;
  const { data, error } = await sb.auth.admin.createUser({
    email: TEST_EMAIL,
    password: printedPassword,
    email_confirm: true,
  });
  if (error) {
    console.error("Failed to create user:", error);
    process.exit(1);
  }
  userId = data.user.id;
  console.log(`   ✓ Created. id=${userId.slice(0, 8)}…`);
}

// ─── 2. Pick 10 contacts (stratified by lead_stage for variety) ───────────
console.log(`\n② Seeding contacts (target: ${PICK_COUNT}, mix of lead stages)`);
const byStage = new Map();
for (const c of contactsAll) {
  const stage = c.lead_stage || "(unknown)";
  if (!byStage.has(stage)) byStage.set(stage, []);
  byStage.get(stage).push(c);
}
console.log(`   Available stages in prod: ${[...byStage.keys()].join(", ")}`);

const picked = [];
const stages = [...byStage.entries()];
let i = 0;
while (picked.length < PICK_COUNT && stages.some(([, arr]) => arr.length > 0)) {
  const [, arr] = stages[i % stages.length];
  if (arr.length > 0) picked.push(arr.shift());
  i++;
}

// Skip ones already in staging (idempotent)
const { data: existingContacts } = await sb
  .from("contacts")
  .select("email")
  .eq("user_id", userId);
const existingEmails = new Set((existingContacts || []).map((c) => c.email.toLowerCase()));

const toInsert = picked
  .filter((c) => !existingEmails.has(c.email.toLowerCase()))
  .map((c) => ({
    user_id: userId,
    email: c.email,
    first_name: c.first_name,
    last_name: c.last_name,
    company: c.company,
    role: c.role,
    tags: c.tags || [],
    status: c.status || "not_contacted",
    lead_stage: c.lead_stage || "new_lead",
    notes: c.notes,
  }));

let insertedContacts = [];
if (toInsert.length === 0) {
  console.log(`   ✓ All ${picked.length} contacts already present.`);
  const { data } = await sb
    .from("contacts")
    .select("*")
    .eq("user_id", userId)
    .limit(PICK_COUNT);
  insertedContacts = data || [];
} else {
  const { data, error } = await sb.from("contacts").insert(toInsert).select();
  if (error) {
    console.error("Contact insert failed:", error);
    process.exit(1);
  }
  insertedContacts = data;
  console.log(`   ✓ Inserted ${data.length} contacts.`);
}

// ─── 3. Sender email (copy first one from prod) ───────────────────────────
console.log(`\n③ Sender email`);
if (sendersAll.length > 0) {
  const s = sendersAll[0];
  const { data: existingSender } = await sb
    .from("sender_emails")
    .select("id, email")
    .eq("user_id", userId)
    .eq("email", s.email)
    .maybeSingle();
  if (existingSender) {
    console.log(`   ✓ Already present: ${s.email}`);
  } else {
    const { error } = await sb.from("sender_emails").insert({
      user_id: userId,
      email: s.email,
      name: s.name,
      daily_limit: s.daily_limit ?? 50,
    });
    if (error) console.error("   ✗ Failed:", error.message);
    else console.log(`   ✓ Inserted: ${s.email}`);
  }
} else {
  console.log("   (no sender_emails in prod — skipping)");
}

// ─── 4. Contact list (copy first one + add seeded contacts) ───────────────
console.log(`\n④ Contact list`);
let newListId = null;
if (listsAll.length > 0) {
  const l = listsAll[0];
  const { data: existingList } = await sb
    .from("contact_lists")
    .select("id, name")
    .eq("user_id", userId)
    .eq("name", l.name)
    .maybeSingle();
  if (existingList) {
    newListId = existingList.id;
    console.log(`   ✓ List already exists: "${l.name}"`);
  } else {
    const { data, error } = await sb
      .from("contact_lists")
      .insert({
        user_id: userId,
        name: l.name,
        description: l.description,
      })
      .select()
      .single();
    if (error) {
      console.error("   ✗ Failed:", error.message);
    } else {
      newListId = data.id;
      console.log(`   ✓ Created list: "${l.name}"`);
    }
  }
}

if (newListId && insertedContacts.length > 0) {
  const { data: existingMembers } = await sb
    .from("list_contacts")
    .select("contact_id")
    .eq("list_id", newListId);
  const existingMemberIds = new Set((existingMembers || []).map((m) => m.contact_id));
  const toAdd = insertedContacts
    .filter((c) => !existingMemberIds.has(c.id))
    .map((c) => ({ list_id: newListId, contact_id: c.id }));
  if (toAdd.length > 0) {
    const { error } = await sb.from("list_contacts").insert(toAdd);
    if (error) console.error("   ✗ list_contacts insert failed:", error.message);
    else console.log(`   ✓ Added ${toAdd.length} contacts to list`);
  } else {
    console.log(`   ✓ All seeded contacts already on list`);
  }
}

// ─── 5. Settings row ──────────────────────────────────────────────────────
console.log(`\n⑤ Settings`);
const { data: existingSettings } = await sb
  .from("settings")
  .select("id")
  .eq("user_id", userId)
  .maybeSingle();
if (existingSettings) {
  console.log(`   ✓ Already exists`);
} else {
  // Pull defaults from prod settings (without copying the real Resend key —
  // staging shouldn't ship real emails by accident)
  const prodSettings = settingsAll[0] || {};
  const { error } = await sb.from("settings").insert({
    user_id: userId,
    from_name: prodSettings.from_name || "Ryan",
    from_email: prodSettings.from_email,
    daily_send_limit: prodSettings.daily_send_limit ?? 50,
    signature_html: prodSettings.signature_html,
    signature_image_url: prodSettings.signature_image_url,
    // resend_api_key intentionally null — staging won't actually send
  });
  if (error) console.error("   ✗ Failed:", error.message);
  else console.log(`   ✓ Created (Resend key blank — set later if you want real sends)`);
}

// ─── Done ─────────────────────────────────────────────────────────────────
console.log(`\n${"━".repeat(60)}`);
console.log(`Staging seeded.`);
console.log(`${"━".repeat(60)}`);
console.log(`  Login URL:  http://localhost:3000/login`);
console.log(`  Email:      ${TEST_EMAIL}`);
if (printedPassword) {
  console.log(`  Password:   ${printedPassword}`);
  console.log(`              ^^ SAVE THIS — won't be shown again`);
} else {
  console.log(`  Password:   (already set previously; reset via Supabase dashboard if forgotten)`);
}
console.log(`${"━".repeat(60)}`);
