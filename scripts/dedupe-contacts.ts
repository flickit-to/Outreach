// Dedupe duplicate contact rows by (user_id, lower(email)).
//
// For each duplicate group:
//   1. Pick a winner (prefer rows with sends, then most-advanced lead_stage,
//      then oldest created_at).
//   2. Re-point losers' references to the winner:
//        - sends.contact_id  → winner (bulk update; no unique constraint)
//        - list_contacts     → winner; if winner already on the list, delete
//                              the loser's join row (unique constraint).
//        - campaign_contacts → same.
//        - enrollments       → same (unique on sequence_id, contact_id).
//   3. Merge loser fields into winner where winner is null
//      (first_name, last_name, company, role, assigned_sender_id).
//   4. Promote winner.lead_stage to the most-advanced stage seen across the
//      group (e.g. if any duplicate is bounced, winner becomes bounced).
//   5. Delete loser rows.
//
// Dry-run by default. Pass --apply to commit. Optional --user=<uuid> to scope
// to one user (default: every user).
//
// Run:
//   npx tsx --env-file=.env.production.local scripts/dedupe-contacts.ts
//   npx tsx --env-file=.env.production.local scripts/dedupe-contacts.ts --apply

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("Missing env vars");
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const userArg = args.find((a) => a.startsWith("--user="))?.split("=")[1];

const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Higher value = more advanced / more important to preserve.
// "bounced" intentionally outranks everything because losing a bounce flag is
// worse than losing a "replied" flag (replies can be re-detected; bounces
// can't be reversed once the address is dead).
const STAGE_RANK: Record<string, number> = {
  bounced: 100,
  closed_won: 90,
  closed_lost: 85,
  meeting_booked: 80,
  replied: 70,
  follow_up_sent: 50,
  follow_up_needed: 45,
  opened: 40,
  email_sent: 30,
  new_lead: 10,
};

type ContactRow = {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  role: string | null;
  lead_stage: string | null;
  assigned_sender_id: string | null;
  created_at: string;
  send_count?: number;
};

async function main() {
  console.log(`\nDB: ${url}`);
  console.log(`Mode: ${apply ? "\x1b[31mAPPLY\x1b[0m" : "\x1b[32mDRY-RUN\x1b[0m"}`);
  if (userArg) console.log(`Scope: user=${userArg}`);
  console.log("");

  // 1. Pull all contacts (optionally one user)
  let query = sb
    .from("contacts")
    .select("id, user_id, email, first_name, last_name, company, role, lead_stage, assigned_sender_id, created_at");
  if (userArg) query = query.eq("user_id", userArg);
  const { data: contacts, error } = await query;
  if (error) throw error;
  if (!contacts) {
    console.log("No contacts.");
    return;
  }
  console.log(`Loaded ${contacts.length} contacts.\n`);

  // 2. Group by (user_id, lower(email))
  const groups: Record<string, ContactRow[]> = {};
  for (const c of contacts as ContactRow[]) {
    const key = `${c.user_id}::${(c.email || "").trim().toLowerCase()}`;
    (groups[key] ||= []).push(c);
  }

  const dupGroups = Object.entries(groups).filter(([_, rows]) => rows.length > 1);
  console.log(`Duplicate groups: ${dupGroups.length}`);
  if (dupGroups.length === 0) {
    console.log("Nothing to dedupe.\n");
    return;
  }

  // 3. Compute send counts per contact (only for ids in dup groups, to keep cheap)
  const dupIds = dupGroups.flatMap(([_, rows]) => rows.map((r) => r.id));
  const sendCount: Record<string, number> = {};
  const PAGE = 500;
  for (let i = 0; i < dupIds.length; i += PAGE) {
    const batch = dupIds.slice(i, i + PAGE);
    const { data: sends } = await sb
      .from("sends")
      .select("contact_id")
      .in("contact_id", batch);
    for (const s of sends || []) {
      sendCount[s.contact_id] = (sendCount[s.contact_id] || 0) + 1;
    }
  }
  for (const r of dupIds) {
    const found = (contacts as ContactRow[]).find((c) => c.id === r);
    if (found) found.send_count = sendCount[r] || 0;
  }

  // 4. For each group, pick winner + plan moves
  type Plan = {
    email: string;
    user_id: string;
    winner: ContactRow;
    losers: ContactRow[];
    promoteLeadStage: string | null;
    fieldMerges: Partial<ContactRow>;
  };
  const plans: Plan[] = [];

  for (const [key, rows] of dupGroups) {
    const sorted = [...rows].sort((a, b) => {
      const sa = (a.send_count || 0) > 0 ? 1 : 0;
      const sb_ = (b.send_count || 0) > 0 ? 1 : 0;
      if (sa !== sb_) return sb_ - sa; // more sends first
      const ra = STAGE_RANK[a.lead_stage || "new_lead"] ?? 0;
      const rb = STAGE_RANK[b.lead_stage || "new_lead"] ?? 0;
      if (ra !== rb) return rb - ra; // higher stage first
      return a.created_at.localeCompare(b.created_at); // older first
    });
    const winner = sorted[0];
    const losers = sorted.slice(1);

    // Most advanced lead_stage across group
    const bestStage = rows.reduce((acc, r) => {
      const rank = STAGE_RANK[r.lead_stage || "new_lead"] ?? 0;
      return rank > acc.rank ? { rank, stage: r.lead_stage } : acc;
    }, { rank: -1, stage: null as string | null }).stage;
    const promoteLeadStage =
      bestStage && bestStage !== winner.lead_stage ? bestStage : null;

    // Field merges: copy from any loser into winner where winner is null
    const fieldMerges: Partial<ContactRow> = {};
    const fields: (keyof ContactRow)[] = ["first_name", "last_name", "company", "role", "assigned_sender_id"];
    for (const f of fields) {
      if (winner[f]) continue;
      for (const l of losers) {
        if (l[f]) {
          (fieldMerges as any)[f] = l[f];
          break;
        }
      }
    }

    plans.push({
      email: winner.email,
      user_id: winner.user_id,
      winner,
      losers,
      promoteLeadStage,
      fieldMerges,
    });
  }

  // 5. Print summary
  console.log(`Plans:\n`);
  for (const p of plans) {
    console.log(`  ${p.email}  (user=${p.user_id.slice(0, 8)}…)`);
    console.log(`    KEEP:   ${p.winner.id}  stage=${p.winner.lead_stage}  sends=${p.winner.send_count || 0}  created=${p.winner.created_at.slice(0, 10)}`);
    for (const l of p.losers) {
      console.log(`    DELETE: ${l.id}  stage=${l.lead_stage}  sends=${l.send_count || 0}  created=${l.created_at.slice(0, 10)}`);
    }
    if (p.promoteLeadStage) {
      console.log(`    → promote winner.lead_stage to "${p.promoteLeadStage}"`);
    }
    if (Object.keys(p.fieldMerges).length > 0) {
      console.log(`    → fill winner null fields: ${Object.entries(p.fieldMerges).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")}`);
    }
    console.log("");
  }

  console.log(`Total: ${plans.length} groups | ${plans.reduce((s, p) => s + p.losers.length, 0)} rows to delete\n`);

  if (!apply) {
    console.log("\x1b[33mDry-run complete. Re-run with --apply to commit.\x1b[0m\n");
    return;
  }

  // 6. APPLY — process each group sequentially
  console.log("\x1b[31mApplying...\x1b[0m\n");
  let groupOk = 0;
  let groupErr = 0;
  let rowsDeleted = 0;

  for (const p of plans) {
    try {
      const winnerId = p.winner.id;
      const loserIds = p.losers.map((l) => l.id);

      // 6a. Move sends
      {
        const { error } = await sb
          .from("sends")
          .update({ contact_id: winnerId })
          .in("contact_id", loserIds);
        if (error) throw new Error(`sends move: ${error.message}`);
      }

      // 6b. list_contacts: handle unique(list_id, contact_id)
      //     Strategy: pull existing winner memberships, delete loser rows that
      //     would conflict, re-point the rest.
      {
        const { data: winnerLists } = await sb
          .from("list_contacts")
          .select("list_id")
          .eq("contact_id", winnerId);
        const winnerListIds = new Set((winnerLists || []).map((r: any) => r.list_id));

        const { data: loserLists } = await sb
          .from("list_contacts")
          .select("id, list_id")
          .in("contact_id", loserIds);

        const conflictIds: string[] = [];
        const safeIds: string[] = [];
        for (const r of loserLists || []) {
          if (winnerListIds.has(r.list_id)) conflictIds.push(r.id);
          else safeIds.push(r.id);
        }
        if (conflictIds.length > 0) {
          const { error } = await sb.from("list_contacts").delete().in("id", conflictIds);
          if (error) throw new Error(`list_contacts conflict delete: ${error.message}`);
        }
        if (safeIds.length > 0) {
          const { error } = await sb
            .from("list_contacts")
            .update({ contact_id: winnerId })
            .in("id", safeIds);
          if (error) throw new Error(`list_contacts move: ${error.message}`);
        }
      }

      // 6c. campaign_contacts: handle unique(campaign_id, contact_id)
      {
        const { data: winnerCC } = await sb
          .from("campaign_contacts")
          .select("campaign_id")
          .eq("contact_id", winnerId);
        const winnerCampaignIds = new Set((winnerCC || []).map((r: any) => r.campaign_id));

        const { data: loserCC } = await sb
          .from("campaign_contacts")
          .select("id, campaign_id")
          .in("contact_id", loserIds);

        const conflictIds: string[] = [];
        const safeIds: string[] = [];
        for (const r of loserCC || []) {
          if (winnerCampaignIds.has(r.campaign_id)) conflictIds.push(r.id);
          else safeIds.push(r.id);
        }
        if (conflictIds.length > 0) {
          const { error } = await sb.from("campaign_contacts").delete().in("id", conflictIds);
          if (error) throw new Error(`campaign_contacts conflict delete: ${error.message}`);
        }
        if (safeIds.length > 0) {
          const { error } = await sb
            .from("campaign_contacts")
            .update({ contact_id: winnerId })
            .in("id", safeIds);
          if (error) throw new Error(`campaign_contacts move: ${error.message}`);
        }
      }

      // 6d. enrollments: handle unique(sequence_id, contact_id)
      {
        const { data: winnerEnr } = await sb
          .from("enrollments")
          .select("sequence_id")
          .eq("contact_id", winnerId);
        const winnerSeqIds = new Set((winnerEnr || []).map((r: any) => r.sequence_id));

        const { data: loserEnr } = await sb
          .from("enrollments")
          .select("id, sequence_id")
          .in("contact_id", loserIds);

        const conflictIds: string[] = [];
        const safeIds: string[] = [];
        for (const r of loserEnr || []) {
          if (winnerSeqIds.has(r.sequence_id)) conflictIds.push(r.id);
          else safeIds.push(r.id);
        }
        if (conflictIds.length > 0) {
          const { error } = await sb.from("enrollments").delete().in("id", conflictIds);
          if (error) throw new Error(`enrollments conflict delete: ${error.message}`);
        }
        if (safeIds.length > 0) {
          const { error } = await sb
            .from("enrollments")
            .update({ contact_id: winnerId })
            .in("id", safeIds);
          if (error) throw new Error(`enrollments move: ${error.message}`);
        }
      }

      // 6e. Update winner: merge fields + promote lead_stage
      const winnerUpdates: any = { ...p.fieldMerges };
      if (p.promoteLeadStage) winnerUpdates.lead_stage = p.promoteLeadStage;
      if (Object.keys(winnerUpdates).length > 0) {
        const { error } = await sb.from("contacts").update(winnerUpdates).eq("id", winnerId);
        if (error) throw new Error(`winner update: ${error.message}`);
      }

      // 6f. Delete losers
      {
        const { error } = await sb.from("contacts").delete().in("id", loserIds);
        if (error) throw new Error(`loser delete: ${error.message}`);
      }

      rowsDeleted += loserIds.length;
      groupOk++;
    } catch (e: any) {
      console.error(`  ✗ ${p.email}: ${e.message}`);
      groupErr++;
    }
  }

  console.log(`\n\x1b[32m✓ ${groupOk} groups merged, ${rowsDeleted} duplicate rows deleted.\x1b[0m`);
  if (groupErr > 0) console.log(`\x1b[31m✗ ${groupErr} groups had errors.\x1b[0m`);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
