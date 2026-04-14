import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: { sendId: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Verify ownership via campaign
  const { data: send } = await admin
    .from("sends")
    .select("id, contact_id, campaign_id, campaigns:campaign_id(user_id)")
    .eq("id", params.sendId)
    .single();

  if (!send || (send as any).campaigns?.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Update send
  await admin
    .from("sends")
    .update({ status: "replied", replied_at: new Date().toISOString() })
    .eq("id", params.sendId);

  // Log event
  await admin.from("events").insert({
    send_id: params.sendId,
    type: "replied",
  });

  // Update contact lead_stage
  await admin
    .from("contacts")
    .update({ lead_stage: "replied" })
    .eq("id", send.contact_id);

  return NextResponse.json({ ok: true });
}
