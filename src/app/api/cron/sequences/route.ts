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

  // Pull due enrollments. Order by next_run_at so the oldest go first.
  const { data: due } = await sb
    .from("enrollments")
    .select("*")
    .eq("status", "active")
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (!due || due.length === 0) {
    return NextResponse.json({ message: "No enrollments due", processed: 0 });
  }

  const tally: Record<string, number> = {};
  for (const e of due) {
    try {
      const r = await runEnrollmentTick(e as never, sb);
      tally[r.kind] = (tally[r.kind] || 0) + 1;
    } catch (err: any) {
      tally["error"] = (tally["error"] || 0) + 1;
      console.error(`tick failed for enrollment=${e.id}:`, err.message);
    }
  }

  return NextResponse.json({ processed: due.length, tally });
}
