// Reads the most recent backup folder and infers the schema (columns + types)
// of each table from sample rows. Useful for confirming what's actually in the DB.
//
// Run with: node scripts/inspect-schema.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const backupsDir = "backups";
const subdirs = readdirSync(backupsDir).filter((d) =>
  statSync(join(backupsDir, d)).isDirectory(),
);
if (subdirs.length === 0) {
  console.error("No backup folders found in ./backups");
  process.exit(1);
}
subdirs.sort();
const latest = subdirs[subdirs.length - 1];
const dir = join(backupsDir, latest);

console.log(`Inspecting: ${dir}\n`);

function inferType(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return `array<${v.length ? inferType(v[0]) : "any"}>`;
  if (typeof v === "object") return "jsonb";
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return "timestamptz";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(v)) return "uuid";
    return "text";
  }
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return Number.isInteger(v) ? "int" : "numeric";
  return typeof v;
}

const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));

for (const t of manifest.tables) {
  if (t.status !== "ok") continue;
  const rows = JSON.parse(readFileSync(join(dir, `${t.table}.json`), "utf8"));
  const cols = new Map();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      const type = inferType(v);
      if (!cols.has(k)) cols.set(k, new Set());
      if (type !== "null") cols.get(k).add(type);
    }
  }
  console.log(`── ${t.table}  (${rows.length} rows)`);
  if (rows.length === 0) {
    console.log("   (empty — columns unknown from data alone)\n");
    continue;
  }
  const colNames = Object.keys(rows[0]);
  for (const col of colNames) {
    const types = [...(cols.get(col) || [])];
    const typeStr = types.length === 0 ? "always-null" : types.join(" | ");
    console.log(`   ${col.padEnd(28)} ${typeStr}`);
  }
  console.log();
}
