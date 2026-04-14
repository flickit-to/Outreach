import { createClient } from "@/lib/supabase/server";
import { CreateListForm } from "@/components/lists/create-list-form";
import type { Contact } from "@/lib/types";

export default async function NewListPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .order("first_name", { ascending: true });

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Create List</h1>
      <CreateListForm contacts={(contacts as Contact[]) || []} userId={user!.id} />
    </div>
  );
}
