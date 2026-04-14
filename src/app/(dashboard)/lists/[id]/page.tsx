import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ContactStatusBadge } from "@/components/contacts/contact-status-badge";
import { LeadStageBadge } from "@/components/contacts/lead-stage-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Users, Mail } from "lucide-react";
import type { ContactList, Contact } from "@/lib/types";

export default async function ListDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

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

  return (
    <div className="space-y-6">
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

      {/* Contacts table */}
      <Card>
        <CardHeader>
          <CardTitle>Contacts in this list</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="py-2 px-3 text-left text-xs font-normal text-muted-foreground">First Name</th>
                  <th className="py-2 px-3 text-left text-xs font-normal text-muted-foreground">Last Name</th>
                  <th className="py-2 px-3 text-left text-xs font-normal text-muted-foreground">Email</th>
                  <th className="py-2 px-3 text-left text-xs font-normal text-muted-foreground">Company</th>
                  <th className="py-2 px-3 text-left text-xs font-normal text-muted-foreground">Role</th>
                  <th className="py-2 px-3 text-left text-xs font-normal text-muted-foreground">Lead Stage</th>
                  <th className="py-2 px-3 text-left text-xs font-normal text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-2 px-3">
                      <Link href={`/contacts/${contact.id}`} className="text-sm font-medium hover:underline">
                        {contact.first_name || "—"}
                      </Link>
                    </td>
                    <td className="py-2 px-3 text-sm">{contact.last_name || ""}</td>
                    <td className="py-2 px-3 text-sm text-muted-foreground">{contact.email}</td>
                    <td className="py-2 px-3 text-sm">{contact.company || ""}</td>
                    <td className="py-2 px-3 text-sm text-muted-foreground">{contact.role || ""}</td>
                    <td className="py-2 px-3">
                      <LeadStageBadge contactId={contact.id} stage={contact.lead_stage} />
                    </td>
                    <td className="py-2 px-3">
                      <ContactStatusBadge status={contact.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
