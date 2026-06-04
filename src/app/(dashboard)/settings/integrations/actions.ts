"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncConnection } from "@/lib/microsoft/sync";

export async function disconnectOutlook(connectionId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("outlook_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", user.id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function syncOutlookNow(connectionId?: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in" };

  const admin = createAdminClient();
  let q = admin
    .from("outlook_connections")
    .select("*")
    .eq("user_id", user.id)
    .neq("status", "disconnected");
  if (connectionId) q = q.eq("id", connectionId);
  const { data: conns, error } = await q;
  if (error) return { ok: false as const, error: error.message };
  if (!conns || conns.length === 0) return { ok: false as const, error: "No connected mailboxes" };

  // Sync messages from the last 30 days on manual sync.
  const sinceIso = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const results = [];
  for (const c of conns) {
    const r = await syncConnection(admin, c as any, { sinceIso });
    results.push(r);
  }
  revalidatePath("/settings");
  revalidatePath("/contacts");
  return { ok: true as const, results };
}
