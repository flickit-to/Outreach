// Cron endpoint: walks active enrollments forward one tick each.
// Called by Vercel Cron (or any external scheduler). Auth via CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runEnrollmentTick } from "@/lib/engine/run-sequence-tick";
import { syncConnection, type SyncResult } from "@/lib/microsoft/sync";

const BATCH_SIZE = 100;
// Sync 25h of Outlook (slightly more than 24h to absorb cron drift / retries).
const OUTLOOK_SYNC_WINDOW_MS = 25 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createAdminClient();

  // Pull due enrollments. We join to sequence_steps so we know each one's
  // step_order, then sort with follow-ups (step_order > 1) BEFORE new
  // outreach (step_order = 1). Within the same step_order, oldest first.
  // Sort in JS rather than via PostgREST referencedTable ordering for
  // portability.
  const { data: due } = await sb
    .from("enrollments")
    .select("*, step:current_step_id(step_order)")
    .eq("status", "active")
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at", { ascending: true })
    .limit(BATCH_SIZE);

  // Outlook sync runs regardless of whether there are enrollments due.
  const outlookResults = await runOutlookSync(sb);

  if (!due || due.length === 0) {
    return NextResponse.json({
      message: "No enrollments due",
      processed: 0,
      outlook: outlookResults,
    });
  }

  // Interleave follow-ups with new outreach so neither queue starves the
  // other. Bucket by step_order (>1 = follow-up, <=1 = new outreach), sort
  // each bucket oldest-first, then zip them: F, N, F, N, …
  // When one bucket runs out, the other drains the rest of the batch.
  const byOrder = (e: any) => e.step?.step_order ?? 0;
  const byNextRun = (a: any, b: any) =>
    (a.next_run_at || "").localeCompare(b.next_run_at || "");
  const followups = due.filter((e) => byOrder(e) > 1).sort(byNextRun);
  const newOutreach = due.filter((e) => byOrder(e) <= 1).sort(byNextRun);
  const sorted: typeof due = [];
  const longer = Math.max(followups.length, newOutreach.length);
  for (let i = 0; i < longer; i++) {
    if (i < followups.length) sorted.push(followups[i]);
    if (i < newOutreach.length) sorted.push(newOutreach[i]);
  }

  const tally: Record<string, number> = {};
  for (const e of sorted) {
    try {
      const r = await runEnrollmentTick(e as never, sb);
      tally[r.kind] = (tally[r.kind] || 0) + 1;
    } catch (err: any) {
      tally["error"] = (tally["error"] || 0) + 1;
      console.error(`tick failed for enrollment=${e.id}:`, err.message);
    }
  }

  return NextResponse.json({ processed: sorted.length, tally, outlook: outlookResults });
}

/**
 * Sync every active Outlook connection. Pulls the last 25 hours so a missed
 * cron tick still catches up the next day. Errors on one mailbox don't stop
 * the others.
 */
async function runOutlookSync(
  sb: ReturnType<typeof createAdminClient>,
): Promise<SyncResult[]> {
  const { data: conns } = await sb
    .from("outlook_connections")
    .select("*")
    .eq("status", "active");
  if (!conns || conns.length === 0) return [];

  const sinceIso = new Date(Date.now() - OUTLOOK_SYNC_WINDOW_MS).toISOString();
  const results: SyncResult[] = [];
  for (const c of conns) {
    try {
      const r = await syncConnection(sb, c as any, { sinceIso });
      results.push(r);
    } catch (e: any) {
      results.push({
        mailbox: (c as any).mailbox_address,
        fetched_inbox: 0,
        fetched_sent: 0,
        activities_created: 0,
        contacts_created: 0,
        replies_marked: 0,
        error: e.message,
      });
    }
  }
  return results;
}
