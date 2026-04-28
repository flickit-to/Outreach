import { createClient } from "@/lib/supabase/server";
import { SequenceBuilder } from "@/components/sequences/sequence-builder";
import type { ContactListWithCount, SenderEmail } from "@/lib/types";
import Link from "next/link";

export default async function NewSequencePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Please <Link href="/login" className="underline">sign in</Link> first.
      </div>
    );
  }

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
      <h1 className="text-2xl font-bold mb-1">New sequence</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Build a multi-step outreach. Add Email, Wait, and Condition steps.
      </p>
      <SequenceBuilder
        lists={listsWithCounts}
        senderEmails={(senderEmails as SenderEmail[]) || []}
        userId={user.id}
      />
    </div>
  );
}
