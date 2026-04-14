import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ContactTable } from "@/components/contacts/contact-table";
import { Button } from "@/components/ui/button";
import { Plus, Upload } from "lucide-react";
import type { Contact } from "@/lib/types";

export default async function ContactsPage() {
  const supabase = createClient();
  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <div className="flex gap-2">
          <Link href="/contacts/import">
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
          </Link>
          <Link href="/contacts/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
          </Link>
        </div>
      </div>
      <ContactTable contacts={(contacts as Contact[]) || []} />
    </div>
  );
}
