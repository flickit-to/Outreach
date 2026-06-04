import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/settings/settings-form";
import { TagsManager } from "@/components/settings/tags-manager";
import { OutlookIntegration } from "@/components/settings/outlook-integration";
import type { Settings, SenderEmail, Tag } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: settings } = await supabase
    .from("settings")
    .select("*")
    .eq("user_id", user!.id)
    .single();

  const { data: senderEmails } = await supabase
    .from("sender_emails")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: true });

  const { data: tags } = await supabase
    .from("tags")
    .select("*")
    .eq("user_id", user!.id)
    .order("name", { ascending: true });

  const { data: outlookConns } = await supabase
    .from("outlook_connections")
    .select("id, mailbox_address, display_name, status, last_sync_at, last_sync_status")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: true });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <SettingsForm
        initialData={settings as Settings | null}
        senderEmails={(senderEmails as SenderEmail[]) || []}
        userId={user!.id}
      />
      <TagsManager tags={(tags as Tag[]) || []} userId={user!.id} />
      <OutlookIntegration connections={(outlookConns as any) || []} />
    </div>
  );
}
