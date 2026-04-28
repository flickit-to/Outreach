// Dry run: reads the most recent backup and prints what the new
// Sequences + Steps shape would look like. NEVER writes to the DB.
//
// Run with: node scripts/dry-run-migration.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const backups = readdirSync("backups").filter((d) =>
  statSync(join("backups", d)).isDirectory(),
);
backups.sort();
const dir = join("backups", backups[backups.length - 1]);
console.log(`Source: ${dir}\n`);

const campaigns = JSON.parse(readFileSync(join(dir, "campaigns.json"), "utf8"));
const campaignContacts = JSON.parse(
  readFileSync(join(dir, "campaign_contacts.json"), "utf8"),
);
const sends = JSON.parse(readFileSync(join(dir, "sends.json"), "utf8"));

// Group: parent campaign + all its children, ordered by scheduled_at
const parents = campaigns.filter((c) => !c.parent_campaign_id);
const childrenByParent = new Map();
for (const c of campaigns.filter((c) => c.parent_campaign_id)) {
  if (!childrenByParent.has(c.parent_campaign_id))
    childrenByParent.set(c.parent_campaign_id, []);
  childrenByParent.get(c.parent_campaign_id).push(c);
}
for (const arr of childrenByParent.values()) {
  arr.sort(
    (a, b) =>
      new Date(a.scheduled_at || a.created_at) -
      new Date(b.scheduled_at || b.created_at),
  );
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  const ms = new Date(b) - new Date(a);
  return Math.round((ms / (1000 * 60 * 60 * 24)) * 10) / 10;
}

function recipientCount(campaignId) {
  return campaignContacts.filter((cc) => cc.campaign_id === campaignId).length;
}

function sendCount(campaignId) {
  return sends.filter((s) => s.campaign_id === campaignId).length;
}

function bar() {
  return "─".repeat(72);
}

let seqNum = 0;
const newSequences = [];
const newSteps = [];

for (const parent of parents) {
  seqNum++;
  console.log(bar());
  console.log(`SEQUENCE ${seqNum}: "${parent.name}"`);
  console.log(bar());
  console.log(
    `  Status:        ${parent.status === "sent" ? "active (already sent)" : parent.status}`,
  );
  console.log(`  List:          ${parent.list_id || "(no list)"}`);
  console.log(`  Send days:     ${JSON.stringify(parent.send_days || "any")}`);
  console.log(`  Recipients:    ${recipientCount(parent.id)}`);
  console.log(`  Sends logged:  ${sendCount(parent.id)}`);

  const seq = {
    legacy_campaign_id: parent.id,
    user_id: parent.user_id,
    name: parent.name,
    status: parent.status === "sent" ? "active" : parent.status,
    from_email_id: parent.from_email_id,
    list_id: parent.list_id,
    send_days: parent.send_days,
    scheduled_at: parent.scheduled_at,
    created_at: parent.created_at,
  };
  newSequences.push(seq);

  console.log("\n  ── STEPS ──\n");

  // Step 1: the parent email itself
  let stepOrder = 1;
  const step1 = {
    sequence_legacy_id: parent.id,
    step_order: stepOrder++,
    type: "email",
    subject: parent.subject,
    subject_b: parent.subject_b,
    body: parent.body,
    send_as_reply: false, // parent is the first email — never a reply
    legacy_campaign_id: parent.id,
  };
  newSteps.push(step1);
  console.log(`  Step 1 [EMAIL]`);
  console.log(`    Subject: "${parent.subject}"`);
  console.log(`    Body:    "${parent.body.split("\n")[0].slice(0, 60)}..."`);
  console.log(`    From legacy campaign: ${parent.id.slice(0, 8)}…`);

  // Children — each becomes wait + condition + email
  const kids = childrenByParent.get(parent.id) || [];
  let prevDate = parent.scheduled_at;

  for (const child of kids) {
    const wait = daysBetween(prevDate, child.scheduled_at);

    if (wait !== null) {
      const waitStep = {
        sequence_legacy_id: parent.id,
        step_order: stepOrder++,
        type: "wait",
        delay_days: wait,
      };
      newSteps.push(waitStep);
      console.log(`\n  Step ${stepOrder - 1} [WAIT]`);
      console.log(`    Delay: ${wait} days`);
    }

    if (child.trigger_engagement) {
      const triggers = child.trigger_engagement.split(",").map((t) => t.trim());
      const condStep = {
        sequence_legacy_id: parent.id,
        step_order: stepOrder++,
        type: "condition",
        triggers,
        within_days: wait || 7,
      };
      newSteps.push(condStep);
      console.log(`\n  Step ${stepOrder - 1} [CONDITION]`);
      console.log(`    If contact has: ${triggers.join(" OR ")}`);
      console.log(`    Within:         ${wait || 7} days`);
      console.log(`    YES → next email step`);
      console.log(`    NO  → end sequence`);
    }

    const emailStep = {
      sequence_legacy_id: parent.id,
      step_order: stepOrder++,
      type: "email",
      subject: child.subject,
      subject_b: child.subject_b,
      body: child.body,
      send_as_reply: child.send_as_reply,
      legacy_campaign_id: child.id,
    };
    newSteps.push(emailStep);
    console.log(`\n  Step ${stepOrder - 1} [EMAIL${child.send_as_reply ? " — sent as reply, threaded" : ""}]`);
    console.log(`    Subject: "${child.subject}"`);
    console.log(`    Body:    "${child.body.split("\n")[0].slice(0, 60)}..."`);
    console.log(
      `    Status:  ${child.status === "cancelled" ? "(was cancelled — won't fire on existing contacts)" : child.status}`,
    );
    console.log(`    From legacy campaign: ${child.id.slice(0, 8)}…`);

    prevDate = child.scheduled_at;
  }

  console.log();
}

console.log(bar());
console.log("DRY RUN SUMMARY");
console.log(bar());
console.log(`  Old: ${campaigns.length} campaigns (${parents.length} root + ${campaigns.length - parents.length} children)`);
console.log(`  New: ${newSequences.length} sequences with ${newSteps.length} total steps`);
console.log(`  Recipients preserved: ${campaignContacts.length}`);
console.log(`  Send history preserved: ${sends.length} sends (untouched — keep pointing to legacy campaign IDs)`);
console.log();
console.log("NOTHING was written to the database. This is a preview only.");
console.log("If this looks right, the real migration script will:");
console.log("  1. Create the new sequences/steps tables (alongside old campaigns)");
console.log("  2. Insert the rows above");
console.log("  3. Add a `sequence_step_id` column to `sends` and backfill it");
console.log("  4. Leave old `campaigns` table untouched as safety net");
