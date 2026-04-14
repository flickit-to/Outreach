import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: { contactId: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Find the latest non-failed send for this contact
  const { data: send } = await admin
    .from("sends")
    .select("id, contact_id")
    .eq("contact_id", params.contactId)
    .not("status", "in", '("failed","bounced","replied")')
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!send) {
    return NextResponse.json({ error: "No eligible send found" }, { status: 404 });
  }

  // Update send
  await admin
    .from("sends")
    .update({ status: "replied", replied_at: new Date().toISOString() })
    .eq("id", send.id);

  // Log event
  await admin.from("events").insert({
    send_id: send.id,
    type: "replied",
  });

  // Update contact lead_stage
  await admin
    .from("contacts")
    .update({ lead_stage: "replied" })
    .eq("id", params.contactId);

  return NextResponse.json({ ok: true });
}
