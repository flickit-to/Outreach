import { createClient } from "@/lib/supabase/server";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import type { ContactListWithCount, SenderEmail } from "@/lib/types";

interface ParentSendData {
  contactId: string;
  contactName: string;
  contactEmail: string;
  status: string;
  sentAt: string;
  day: string; // YYYY-MM-DD in Sydney
}

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: { parent?: string; name?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch lists
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

  // If creating a follow-up, fetch parent campaign sends
  let parentSends: ParentSendData[] = [];
  let parentName = "";
  if (searchParams.parent) {
    const { data: parent } = await supabase
      .from("campaigns")
      .select("name")
      .eq("id", searchParams.parent)
      .single();
    parentName = parent?.name || "";

    const { data: sends } = await supabase
      .from("sends")
      .select("contact_id, status, sent_at, contacts:contact_id(first_name, last_name, email, lead_stage)")
      .eq("campaign_id", searchParams.parent)
      .neq("status", "failed")
      .order("sent_at");

    parentSends = (sends || [])
      .filter((s: any) => s.contacts)
      .map((s: any) => ({
        contactId: s.contact_id,
        contactName: [s.contacts?.first_name, s.contacts?.last_name].filter(Boolean).join(" "),
        contactEmail: s.contacts?.email || "",
        status: s.status,
        leadStage: s.contacts?.lead_stage || "new_lead",
        sentAt: s.sent_at,
        day: s.sent_at ? new Date(s.sent_at).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }) : "",
      }));
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">
        {searchParams.parent ? "Create Follow-up Campaign" : "New Campaign"}
      </h1>
      <CampaignForm
        lists={listsWithCounts}
        senderEmails={(senderEmails as SenderEmail[]) || []}
        userId={user!.id}
        parentSends={parentSends}
        parentName={parentName}
      />
    </div>
  );
}
