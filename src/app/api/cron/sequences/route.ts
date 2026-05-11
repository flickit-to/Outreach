// Cron endpoint: walks active enrollments forward one tick each.
// Called by Vercel Cron (or any external scheduler). Auth via CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runEnrollmentTick } from "@/lib/engine/run-sequence-tick";

const BATCH_SIZE = 100;

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

  if (!due || due.length === 0) {
    return NextResponse.json({ message: "No enrollments due", processed: 0 });
  }

  // Priority sort: higher step_order first (follow-ups beat new outreach),
  // then older next_run_at first. Null step_order (homeless enrollments)
  // ranks last — they'll noop in the tick anyway.
  const sorted = [...due].sort((a: any, b: any) => {
    const aOrder = a.step?.step_order ?? 0;
    const bOrder = b.step?.step_order ?? 0;
    if (aOrder !== bOrder) return bOrder - aOrder;
    return (a.next_run_at || "").localeCompare(b.next_run_at || "");
  });

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

  return NextResponse.json({ processed: sorted.length, tally });
}
