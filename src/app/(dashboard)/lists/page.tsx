import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Users } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { DeleteListButton } from "@/components/lists/delete-list-button";

export default async function ListsPage() {
  const supabase = createClient();

  const { data: lists } = await supabase
    .from("contact_lists")
    .select("*")
    .order("created_at", { ascending: false });

  // Get counts for each list
  const listsWithCounts = [];
  for (const list of lists || []) {
    const { count } = await supabase
      .from("list_contacts")
      .select("*", { count: "exact", head: true })
      .eq("list_id", list.id);
    listsWithCounts.push({ ...list, contact_count: count || 0 });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Lists</h1>
        <Link href="/lists/new">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Create List
          </Button>
        </Link>
      </div>

      {listsWithCounts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No lists yet. Create your first list to organize contacts.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {listsWithCounts.map((list) => (
            <Link key={list.id} href={`/lists/${list.id}`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-md bg-primary/10">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{list.name}</p>
                      {list.description && (
                        <p className="text-sm text-muted-foreground">{list.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <span>{list.contact_count} contacts</span>
                    <span>{formatDate(list.created_at)}</span>
                    <DeleteListButton listId={list.id} listName={list.name} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
