// Read-only database backup. Dumps every row of every known table
// into a timestamped folder under ./backups/. Never writes to the DB.
//
// Run with:
//   node --env-file=.env.production.local scripts/backup-database.mjs

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Run with: node --env-file=.env.production.local scripts/backup-database.mjs");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// All tables we know about. The script probes each and skips missing ones.
const TABLES = [
  "contacts",
  "campaigns",
  "campaign_contacts",
  "sends",
  "events",
  "sender_emails",
  "contact_lists",
  "list_contacts",
  "tags",
  "settings",
];

const PAGE_SIZE = 1000;

async function dumpTable(table) {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (error.code === "42P01" || /relation .* does not exist/i.test(error.message)) {
        return { table, status: "missing", rows: 0 };
      }
      return { table, status: "error", error: error.message, rows: all.length };
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { table, status: "ok", rows: all.length, data: all };
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join("backups", stamp);
  mkdirSync(dir, { recursive: true });

  console.log(`Backup target: ${dir}`);
  console.log(`Source:        ${SUPABASE_URL}\n`);

  const results = [];
  for (const table of TABLES) {
    process.stdout.write(`  ${table.padEnd(22)} `);
    const r = await dumpTable(table);
    if (r.status === "ok") {
      writeFileSync(join(dir, `${table}.json`), JSON.stringify(r.data, null, 2));
      console.log(`✓ ${r.rows} rows`);
    } else if (r.status === "missing") {
      console.log("· (table not present, skipped)");
    } else {
      console.log(`✗ error: ${r.error}`);
    }
    results.push({ table: r.table, status: r.status, rows: r.rows, error: r.error });
  }

  const manifest = {
    backed_up_at: new Date().toISOString(),
    source_url: SUPABASE_URL,
    tables: results,
    total_rows: results.reduce((n, r) => n + (r.rows || 0), 0),
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`\nTotal rows backed up: ${manifest.total_rows}`);
  console.log(`Manifest:             ${join(dir, "manifest.json")}`);

  const failed = results.filter((r) => r.status === "error");
  if (failed.length) {
    console.error(`\n⚠️  ${failed.length} table(s) failed. Backup is INCOMPLETE.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Backup failed:", e);
  process.exit(1);
});
