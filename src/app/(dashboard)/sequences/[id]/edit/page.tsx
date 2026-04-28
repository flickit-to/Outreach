import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SequenceBuilder } from "@/components/sequences/sequence-builder";
import type {
  ContactListWithCount,
  SenderEmail,
  SequenceStep,
} from "@/lib/types";
import { ArrowLeft } from "lucide-react";

export default async function EditSequencePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Please <Link href="/login" className="underline">sign in</Link> first.
      </div>
    );
  }

  const { data: sequence } = await supabase
    .from("sequences")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!sequence) notFound();

  if (sequence.status === "active") {
    // Bounce the user back to the detail page where the action bar makes
    // it clear they need to pause first.
    redirect(`/sequences/${params.id}`);
  }

  const { data: steps } = await supabase
    .from("sequence_steps")
    .select("*")
    .eq("sequence_id", params.id)
    .order("step_order", { ascending: true });

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
      <Link
        href={`/sequences/${params.id}`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to sequence
      </Link>
      <h1 className="text-2xl font-bold mb-1">Edit sequence</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Editing replaces all steps. Existing enrollments may need to be re-activated to use the new flow.
      </p>
      <SequenceBuilder
        lists={listsWithCounts}
        senderEmails={(senderEmails as SenderEmail[]) || []}
        userId={user.id}
        initial={{
          id: sequence.id,
          name: sequence.name,
          listId: sequence.list_id,
          fromEmailId: sequence.from_email_id,
          sendDays: sequence.send_days || [1, 2, 3, 4, 5],
          steps: (steps as SequenceStep[]) || [],
        }}
      />
    </div>
  );
}
