// Click tracking endpoint. Updates the activity's click status and redirects
// to the real URL. If something goes wrong, still redirects (don't break the
// recipient's experience).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const activityId = params.id;
  const url = new URL(req.url);
  const target = url.searchParams.get("u");

  // Best-effort tracking
  (async () => {
    try {
      const admin = createAdminClient();
      const nowIso = new Date().toISOString();
      const { data: row } = await admin
        .from("activities")
        .select("id, clicked_at, opened_at, status, click_count")
        .eq("id", activityId)
        .maybeSingle();
      if (!row) return;
      const updates: any = {
        click_count: (row.click_count || 0) + 1,
      };
      if (!row.clicked_at) updates.clicked_at = nowIso;
      if (!row.opened_at) updates.opened_at = nowIso; // click implies open
      if (["sent", "delivered", "opened"].includes(row.status)) {
        updates.status = "clicked";
      }
      await admin.from("activities").update(updates).eq("id", activityId);
    } catch {
      // Swallow — redirect must still happen.
    }
  })();

  // Validate the target URL — never redirect to javascript:, etc.
  let safe = "https://example.com/";
  try {
    if (target) {
      const t = new URL(target);
      if (t.protocol === "http:" || t.protocol === "https:") safe = target;
    }
  } catch {
    // fallthrough, safe stays as fallback
  }
  return NextResponse.redirect(safe, { status: 302 });
}
