import { createClient } from "@/lib/supabase/server";
import { ComposeForm } from "@/components/compose/compose-form";

export const dynamic = "force-dynamic";

export default async function ComposePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: outlookConnections } = await supabase
    .from("outlook_connections")
    .select("id, mailbox_address")
    .eq("user_id", user!.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const { data: settings } = await supabase
    .from("settings")
    .select("signature_html, signature_image_url")
    .eq("user_id", user!.id)
    .maybeSingle();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Send email</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compose a one-off email. Tracked opens and clicks. Recipient
          auto-added to your contacts if new.
        </p>
      </div>
      <ComposeForm
        outlookConnections={(outlookConnections as any) || []}
        signatureHtml={settings?.signature_html || null}
        signatureImageUrl={settings?.signature_image_url || null}
      />
    </div>
  );
}
