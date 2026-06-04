// Backfill contacts.company by inferring it from the email domain.
// Skips contacts that already have a company set, and skips personal email
// domains (gmail/yahoo/etc.) where no meaningful company can be derived.
//
// Run:
//   npx tsx --env-file=.env.production.local scripts/backfill-company-from-domain.ts          # dry-run
//   npx tsx --env-file=.env.production.local scripts/backfill-company-from-domain.ts --apply

import { createClient } from "@supabase/supabase-js";
import { extractCompanyFromEmail } from "../src/lib/contacts/extract";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const apply = process.argv.includes("--apply");

async function main() {
  console.log(`\nMode: ${apply ? "\x1b[31mAPPLY\x1b[0m" : "\x1b[32mDRY-RUN\x1b[0m"}\n`);

  // Pull all contacts with null/empty company.
  const { data: contacts, error } = await sb
    .from("contacts")
    .select("id, email, company, user_id")
    .or("company.is.null,company.eq.");
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log(`Contacts with no company: ${contacts?.length || 0}\n`);

  type Plan = { id: string; email: string; company: string };
  const plans: Plan[] = [];
  let skippedPersonal = 0;
  let skippedNoDomain = 0;
  for (const c of contacts || []) {
    const company = extractCompanyFromEmail(c.email);
    if (!company) {
      // Personal domain OR no @
      if ((c.email || "").includes("@")) skippedPersonal++;
      else skippedNoDomain++;
      continue;
    }
    plans.push({ id: c.id, email: c.email, company });
  }

  console.log(`Will populate company on:   ${plans.length}`);
  console.log(`Skipped (personal domain):  ${skippedPersonal}`);
  console.log(`Skipped (no/bad email):     ${skippedNoDomain}\n`);

  // Show a sample of what's about to land
  console.log("Sample (first 10):");
  for (const p of plans.slice(0, 10)) {
    console.log(`  ${p.email.padEnd(40)} → "${p.company}"`);
  }
  if (plans.length > 10) console.log(`  … and ${plans.length - 10} more\n`);
  else console.log("");

  if (!apply) {
    console.log("\x1b[33mDry-run complete. Re-run with --apply to commit.\x1b[0m\n");
    return;
  }

  console.log("\x1b[31mApplying...\x1b[0m");
  // Group by company so we do fewer UPDATEs.
  const byCompany = new Map<string, string[]>();
  for (const p of plans) {
    const arr = byCompany.get(p.company) ?? [];
    arr.push(p.id);
    byCompany.set(p.company, arr);
  }
  let updated = 0;
  for (const [company, ids] of Array.from(byCompany.entries())) {
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const { error: upErr } = await sb
        .from("contacts")
        .update({ company })
        .in("id", batch);
      if (upErr) {
        console.error(`  ✗ "${company}" batch:`, upErr.message);
      } else {
        updated += batch.length;
      }
    }
  }
  console.log(`\n\x1b[32m✓ Updated ${updated}/${plans.length} contacts.\x1b[0m\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
