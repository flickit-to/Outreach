import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ContactTable } from "@/components/contacts/contact-table";
import { AddContactsToListButton } from "@/components/lists/add-contacts-to-list-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Users, Mail } from "lucide-react";
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

  // Fetch all contacts (for add-contacts dialog) - minus ones already in list
  const { data: allContactsRaw } = await supabase
    .from("contacts")
    .select("*")
    .order("first_name");
  const availableContacts = ((allContactsRaw as Contact[]) || []).filter((c) => !contactIdsInList.includes(c.id));

  // Tags for color rendering
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
            {(list as ContactList).description && (
              <p className="text-sm text-muted-foreground">{(list as ContactList).description}</p>
            )}
          </div>
        </div>
        <AddContactsToListButton
          listId={params.id}
          availableContacts={availableContacts}
        />
      </div>

      <div className="flex gap-4">
        <Card className="flex-1">
          <CardContent className="pt-6 flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">{contacts.length}</p>
              <p className="text-xs text-muted-foreground">Contacts</p>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="pt-6 flex items-center gap-3">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">{formatDate((list as ContactList).created_at)}</p>
              <p className="text-xs text-muted-foreground">Created</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Full-featured contact table — same as /contacts page */}
      <ContactTable contacts={contacts} allTags={(tags as Tag[]) || []} />
    </div>
  );
}
