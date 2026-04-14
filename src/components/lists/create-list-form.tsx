"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Contact } from "@/lib/types";
import { ContactSelector } from "@/components/campaigns/contact-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export function CreateListForm({
  contacts,
  userId,
}: {
  contacts: Contact[];
  userId: string;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast({ title: "Error", description: "List name is required", variant: "destructive" });
      return;
    }
    if (selectedContacts.length === 0) {
      toast({ title: "Error", description: "Select at least one contact", variant: "destructive" });
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // Create the list
    const { data: list, error: listError } = await supabase
      .from("contact_lists")
      .insert({
        user_id: userId,
        name: name.trim(),
        description: description.trim() || null,
      })
      .select()
      .single();

    if (listError || !list) {
      toast({ title: "Error", description: listError?.message || "Failed to create list", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Add contacts to the list
    const listContacts = selectedContacts.map((contactId) => ({
      list_id: list.id,
      contact_id: contactId,
    }));

    const { error: lcError } = await supabase
      .from("list_contacts")
      .insert(listContacts);

    if (lcError) {
      toast({ title: "Error", description: lcError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    toast({ title: "List created", description: `${selectedContacts.length} contacts added to "${name}"` });
    router.push("/lists");
    router.refresh();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>List Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">List Name *</Label>
            <Input
              id="name"
              placeholder="e.g. Q1 SaaS Leads"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Optional description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Select Contacts</CardTitle>
        </CardHeader>
        <CardContent>
          <ContactSelector
            contacts={contacts}
            selected={selectedContacts}
            onChange={setSelectedContacts}
          />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : `Create List (${selectedContacts.length} contacts)`}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/lists")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
