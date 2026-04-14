"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Contact } from "@/lib/types";
import { ContactSelector } from "@/components/campaigns/contact-selector";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function AddContactsToListButton({
  listId,
  availableContacts,
}: {
  listId: string;
  availableContacts: Contact[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleAdd() {
    if (selected.length === 0) return;
    setSaving(true);

    const supabase = createClient();
    const items = selected.map((contactId) => ({
      list_id: listId,
      contact_id: contactId,
    }));

    // Insert one at a time so we can track duplicates gracefully
    let added = 0;
    let skipped = 0;
    for (const item of items) {
      const { error } = await supabase.from("list_contacts").insert(item);
      if (error) {
        if (error.message.includes("duplicate") || error.message.includes("unique")) {
          skipped++;
        } else {
          toast({ title: "Error", description: error.message, variant: "destructive" });
          setSaving(false);
          return;
        }
      } else {
        added++;
      }
    }

    setSaving(false);
    setOpen(false);
    setSelected([]);

    if (skipped > 0) {
      toast({
        title: `${added} added`,
        description: `${skipped} contacts were already in this list and were skipped.`,
      });
    } else {
      toast({ title: `${added} contacts added to list` });
    }
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={availableContacts.length === 0}>
        <Plus className="h-4 w-4 mr-2" />
        Add Contacts
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Contacts to List</DialogTitle>
            <DialogDescription>
              {availableContacts.length === 0
                ? "All your contacts are already in this list."
                : `Choose from ${availableContacts.length} contacts not yet in this list.`}
            </DialogDescription>
          </DialogHeader>
          {availableContacts.length > 0 && (
            <ContactSelector
              contacts={availableContacts}
              selected={selected}
              onChange={setSelected}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={saving || selected.length === 0}
            >
              {saving ? "Adding..." : `Add ${selected.length} Contact${selected.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
