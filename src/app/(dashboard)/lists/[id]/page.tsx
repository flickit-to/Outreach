import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ContactTable } from "@/components/contacts/contact-table";
import { AddContactsToListButton } from "@/components/lists/add-contacts-to-list-button";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import type { ContactList, Contact, Tag } from "@/lib/types";

export default async function ListDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: list } = await supabase
    .from("contact_lists")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!list) notFound();

  const { data: listContacts } = await supabase
    .from("list_contacts")
    .select("contact_id, contacts:contact_id(*)")
    .eq("list_id", params.id);

  const contacts = (listContacts || []).map((lc: any) => lc.contacts as Contact).filter(Boolean);
  const contactIdsInList = contacts.map((c) => c.id);

  const { data: allContactsRaw } = await supabase
    .from("contacts")
    .select("*")
    .order("first_name");
  const availableContacts = ((allContactsRaw as Contact[]) || []).filter((c) => !contactIdsInList.includes(c.id));

  const { data: tags } = await supabase
    .from("tags")
    .select("*")
    .eq("user_id", user!.id)
    .order("name");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/lists">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{(list as ContactList).name}</h1>
            <p className="text-sm text-muted-foreground">
              {contacts.length} contacts · Created {formatDate((list as ContactList).created_at)}
              {(list as ContactList).description && ` · ${(list as ContactList).description}`}
            </p>
          </div>
        </div>
        <AddContactsToListButton
          listId={params.id}
          availableContacts={availableContacts}
        />
      </div>

      <ContactTable contacts={contacts} allTags={(tags as Tag[]) || []} />
    </div>
  );
}
