import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Resend webhook payload: { type: string, data: { email_id: string, ... } }
  const { type, data } = body;

  if (!type || !data?.email_id) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Find the send by resend_id
  const { data: send } = await supabase
    .from("sends")
    .select("id, contact_id, status")
    .eq("resend_id", data.email_id)
    .single();

  if (!send) {
    // Unknown email, ignore
    return NextResponse.json({ ok: true });
  }

  try {
    switch (type) {
      case "email.delivered": {
        // Only update if not already at higher status
        if (["pending", "sent"].includes(send.status)) {
          await supabase
            .from("sends")
            .update({
              status: "delivered",
              delivered_at: new Date().toISOString(),
            })
            .eq("id", send.id);
        }
        await supabase.from("events").insert({
          send_id: send.id,
          type: "delivered",
        });
        break;
      }

      case "email.bounced":
      case "email.complained": {
        // Bounce ALWAYS overrides any status (even opened/clicked from Gmail proxy)
        await supabase
          .from("sends")
          .update({
            status: "bounced",
            bounced_at: new Date().toISOString(),
            opened_at: null,
            clicked_at: null,
          })
          .eq("id", send.id);

        await supabase.from("events").insert({
          send_id: send.id,
          type: "bounced",
          metadata: { reason: data.bounce?.message || data.bounce?.type || data.complaint?.type || "unknown" },
        });

        // Reset contact lead_stage if it was auto-advanced by fake open
        await supabase.rpc("recalculate_contact_status", { p_contact_id: send.contact_id });

        break;
      }

      case "email.opened": {
        // Resend's own open tracking — log event, update if not already tracked
        if (!["opened", "clicked"].includes(send.status)) {
          await supabase
            .from("sends")
            .update({
              status: "opened",
              opened_at: new Date().toISOString(),
            })
            .eq("id", send.id);
        }
        await supabase.from("events").insert({
          send_id: send.id,
          type: "opened",
          metadata: { source: "resend_webhook" },
        });
        break;
      }

      case "email.clicked": {
        await supabase
          .from("sends")
          .update({
            status: "clicked",
            clicked_at: new Date().toISOString(),
          })
          .eq("id", send.id);

        await supabase.from("events").insert({
          send_id: send.id,
          type: "clicked",
          metadata: { source: "resend_webhook", url: data.click?.link },
        });
        break;
      }

      case "email.replied": {
        // Auto-detect reply via Resend webhook
        await supabase
          .from("sends")
          .update({
            status: "replied",
            replied_at: new Date().toISOString(),
          })
          .eq("id", send.id);

        await supabase.from("events").insert({
          send_id: send.id,
          type: "replied",
          metadata: { source: "resend_webhook" },
        });

        // Auto-advance lead stage to "replied"
        await supabase
          .from("contacts")
          .update({ lead_stage: "replied" })
          .eq("id", send.contact_id)
          .in("lead_stage", ["new_lead", "email_sent", "opened", "follow_up_needed", "follow_up_sent"]);

        break;
      }
    }

    // Recalculate contact status
    await supabase.rpc("recalculate_contact_status", {
      p_contact_id: send.contact_id,
    });

    // Auto-update lead stage based on webhook event
    if (type === "email.opened") {
      await supabase
        .from("contacts")
        .update({ lead_stage: "opened" })
        .eq("id", send.contact_id)
        .in("lead_stage", ["email_sent", "follow_up_sent"]);
    }
  } catch {
    // Log but don't fail
  }

  return NextResponse.json({ ok: true });
}
