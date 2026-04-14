import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CampaignEditForm } from "@/components/campaigns/campaign-edit-form";
import type { Campaign, ContactListWithCount, SenderEmail } from "@/lib/types";

export default async function EditCampaignPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!campaign) notFound();

  // Fetch lists with counts
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
      <h1 className="text-2xl font-bold mb-6">Edit Campaign</h1>
      <CampaignEditForm
        campaign={campaign as Campaign}
        lists={listsWithCounts}
        senderEmails={(senderEmails as SenderEmail[]) || []}
      />
    </div>
  );
}
