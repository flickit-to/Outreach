// Sanity check: can we talk to staging at all?
// Run with: node --env-file=.env.staging.local scripts/test-staging-connection.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing env vars");
  process.exit(1);
}

console.log(`Connecting to: ${url}`);
const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const tables = [
  "contacts",
  "campaigns",
  "sends",
  "events",
  "sequences",
  "sequence_steps",
  "enrollments",
  "broadcasts",
  "automations",
  "sender_emails",
  "contact_lists",
  "list_contacts",
  "tags",
  "settings",
];

console.log("\nProbing tables:");
let missing = 0;
for (const t of tables) {
  // Real SELECT, not HEAD — HEAD masks PGRST205 in the new key format
  const { error, data } = await sb.from(t).select("id").limit(1);
  if (error && error.code === "PGRST205") {
    console.log(`  ${t.padEnd(22)} ✗ (not found)`);
    missing++;
  } else if (error) {
    console.log(`  ${t.padEnd(22)} ✗ ${error.message}`);
    missing++;
  } else {
    // Get a real count
    const { count } = await sb.from(t).select("*", { count: "exact", head: true });
    console.log(`  ${t.padEnd(22)} ✓ ${count ?? data?.length ?? 0} rows`);
  }
}

console.log();
if (missing === 0) {
  console.log("✓ All tables present. Schema is in place.");
} else {
  console.log(`⚠️  ${missing} table(s) missing. Schema not applied yet.`);
}
