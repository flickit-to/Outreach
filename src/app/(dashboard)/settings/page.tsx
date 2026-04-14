import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/settings/settings-form";
import type { Settings, SenderEmail } from "@/lib/types";

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

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <SettingsForm
        initialData={settings as Settings | null}
        senderEmails={(senderEmails as SenderEmail[]) || []}
        userId={user!.id}
      />
    </div>
  );
}
