// Applies a SQL file directly to a Supabase Postgres DB.
// Uses the connection-pooler (works even if direct IPv6 isn't reachable).
//
// Run with:
//   node --env-file=.env.staging.local scripts/apply-schema.mjs supabase/staging-init.sql

import postgres from "postgres";
import { readFileSync } from "node:fs";

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error("Usage: node scripts/apply-schema.mjs <path-to-sql-file>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const password = process.env.SUPABASE_DB_PASSWORD;
if (!url || !password) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_DB_PASSWORD");
  process.exit(1);
}

// Project ref is the hostname's first label
const projectRef = new URL(url).hostname.split(".")[0];

// Try connection candidates in order. Pooler comes first because it has
// reliable IPv4; the direct host is IPv6-only on the free tier.
const regions = [
  "ap-southeast-2", "ap-southeast-1", "ap-northeast-1", "ap-northeast-2",
  "ap-south-1", "ap-east-1", "us-east-1", "us-west-1", "us-west-2",
  "eu-west-1", "eu-west-2", "eu-central-1",
];
const candidates = regions.map((r) => ({
  name: `session-pooler ${r}`,
  host: `aws-0-${r}.pooler.supabase.com`,
  port: 5432,
  user: `postgres.${projectRef}`,
}));

const sqlText = readFileSync(sqlFile, "utf8");
console.log(`Applying ${sqlFile} (${sqlText.split("\n").length} lines)\n`);

let lastErr;
for (const c of candidates) {
  console.log(`Trying ${c.name} (${c.host}:${c.port})...`);
  const sql = postgres({
    host: c.host,
    port: c.port,
    user: c.user,
    password,
    database: "postgres",
    ssl: "require",
    connect_timeout: 10,
    max: 1,
    prepare: false,
  });
  try {
    // Execute the entire file as a single multi-statement command.
    // postgres() uses .unsafe() to send raw text without prepared-statement
    // wrapping (DDL with multiple statements doesn't work in prepared mode).
    await sql.unsafe(sqlText);
    console.log(`✓ Applied via ${c.name}\n`);
    await sql.end();
    process.exit(0);
  } catch (e) {
    lastErr = e;
    console.log(`  ✗ ${e.code || ""} ${e.message}`);
    try { await sql.end(); } catch {}
  }
}

console.error("\nAll connection candidates failed.");
console.error("Last error:", lastErr?.message);
process.exit(1);
