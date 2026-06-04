// Tracking pixel endpoint. Returns a 1x1 transparent GIF and best-effort
// updates the activity's open status. Failures are silent — we never want
// to break image rendering in a recipient's mail client.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 1x1 transparent GIF
const PIXEL_BYTES = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const activityId = params.id;

  // Fire-and-forget the DB update so the pixel returns ASAP.
  (async () => {
    try {
      const admin = createAdminClient();
      const nowIso = new Date().toISOString();
      // Bump open_count + set opened_at on first open + always set last_open_at.
      // RPC would be cleaner, but a read-then-write is fine at this volume.
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
      // Only escalate status forward — don't overwrite clicked/replied/bounced.
      if (["sent", "delivered"].includes(row.status)) updates.status = "opened";
      await admin.from("activities").update(updates).eq("id", activityId);
    } catch {
      // Swallow — pixel must still return.
    }
  })();

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
