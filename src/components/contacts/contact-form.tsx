"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { contactSchema, type ContactInput } from "@/lib/validators";
import type { Contact, Tag } from "@/lib/types";
import { TagSelector } from "./tag-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export function ContactForm({
  contact,
  userId,
  allTags = [],
}: {
  contact?: Contact;
  userId: string;
  allTags?: Tag[];
}) {
  const [loading, setLoading] = useState(false);
  const [tagNames, setTagNames] = useState<string[]>(contact?.tags || []);
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = !!contact;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      email: contact?.email || "",
      first_name: contact?.first_name || "",
      last_name: contact?.last_name || "",
      company: contact?.company || "",
      role: contact?.role || "",
      tags: contact?.tags.join(", ") || "",
      notes: contact?.notes || "",
    },
  });

  async function onSubmit(data: ContactInput) {
    setLoading(true);
    const supabase = createClient();

    const tags = tagNames;

    const payload = {
      email: data.email.toLowerCase().trim(),
      first_name: data.first_name || null,
      last_name: data.last_name || null,
      company: data.company || null,
      role: data.role || null,
      tags,
      notes: data.notes || null,
      user_id: userId,
    };

    const { error } = isEdit
      ? await supabase.from("contacts").update(payload).eq("id", contact.id)
      : await supabase.from("contacts").insert(payload);

    setLoading(false);

    if (error) {
      toast({
        title: "Error",
        description: error.message.includes("contacts_user_email_idx")
          ? "A contact with this email already exists."
          : error.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: isEdit ? "Contact updated" : "Contact created" });
    router.push("/contacts");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEdit ? "Edit Contact" : "Add Contact"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input id="email" type="email" placeholder="contact@example.com" {...register("email")} />
            {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name</Label>
              <Input id="first_name" placeholder="John" {...register("first_name")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name</Label>
              <Input id="last_name" placeholder="Smith" {...register("last_name")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input id="company" placeholder="Acme Inc" {...register("company")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Input id="role" placeholder="CEO" {...register("role")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tags</Label>
            <TagSelector
              allTags={allTags}
              selectedTagNames={tagNames}
              onChange={setTagNames}
              userId={userId}
            />
            <p className="text-xs text-muted-foreground">
              Manage tag colors in Settings → Tags
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" placeholder="Any notes about this contact..." {...register("notes")} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isEdit ? "Update Contact" : "Add Contact"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/contacts")}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
