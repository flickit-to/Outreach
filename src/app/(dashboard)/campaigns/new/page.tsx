import { createClient } from "@/lib/supabase/server";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import type { ContactListWithCount, SenderEmail } from "@/lib/types";

export default async function NewCampaignPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch lists with contact counts
  const { data: lists } = await supabase
    .from("contact_lists")
    .select("*")
    .order("created_at", { ascending: false });

  const listsWithCounts: ContactListWithCount[] = [];
  for (const list of lists || []) {
    const { count } = await supabase
      .from("list_contacts")
      .select("*", { count: "exact", head: true })
      .eq("list_id", list.id);
    listsWithCounts.push({ ...list, contact_count: count || 0 });
  }

  const { data: senderEmails } = await supabase
    .from("sender_emails")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">New Campaign</h1>
      <CampaignForm
        lists={listsWithCounts}
        senderEmails={(senderEmails as SenderEmail[]) || []}
        userId={user!.id}
      />
    </div>
  );
}
