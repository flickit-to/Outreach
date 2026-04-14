import { createClient } from "@/lib/supabase/server";
import { ContactForm } from "@/components/contacts/contact-form";
import type { Tag } from "@/lib/types";

export default async function NewContactPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: tags } = await supabase
    .from("tags")
    .select("*")
    .eq("user_id", user!.id)
    .order("name");

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Add Contact</h1>
      <ContactForm userId={user!.id} allTags={(tags as Tag[]) || []} />
    </div>
  );
}
