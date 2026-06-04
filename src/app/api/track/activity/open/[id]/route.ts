// Tracking pixel endpoint. Awaits the DB update so the recording survives
// Vercel's lambda freeze (fire-and-forget background tasks get killed when
// the response is sent).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 1x1 transparent GIF
const PIXEL_BYTES = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await recordOpen(params.id);
  return new NextResponse(PIXEL_BYTES as any, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

async function recordOpen(activityId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const { data: row } = await admin
      .from("activities")
      .select("id, opened_at, status, open_count")
      .eq("id", activityId)
      .maybeSingle();
    if (!row) return;
    const updates: any = {
      last_open_at: nowIso,
      open_count: (row.open_count || 0) + 1,
    };
    if (!row.opened_at) updates.opened_at = nowIso;
    if (["sent", "delivered"].includes(row.status)) updates.status = "opened";
    await admin.from("activities").update(updates).eq("id", activityId);
  } catch (e) {
    // Never throw — pixel must still return.
    console.error(`recordOpen failed for ${activityId}:`, e);
  }
}
