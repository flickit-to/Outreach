// Click tracking endpoint. Awaits the DB update so the recording survives
// Vercel's lambda freeze, then 302s to the real URL.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const target = url.searchParams.get("u");

  await recordClick(params.id);

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

async function recordClick(activityId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const { data: row } = await admin
      .from("activities")
      .select("id, contact_id, clicked_at, opened_at, status, click_count")
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

    // Forward-only bump on the contact's overall status.
    if (row.contact_id) {
      await admin
        .from("contacts")
        .update({ status: "clicked" })
        .eq("id", row.contact_id)
        .in("status", ["not_contacted", "sent", "delivered", "opened", "clicked"]);
    }
  } catch (e) {
    // Never throw — redirect must still happen.
    console.error(`recordClick failed for ${activityId}:`, e);
  }
}
