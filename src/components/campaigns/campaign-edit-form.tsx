"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { campaignSchema, type CampaignInput } from "@/lib/validators";
import type { Campaign, ContactListWithCount, SenderEmail } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export function CampaignEditForm({
  campaign,
  lists,
  senderEmails,
}: {
  campaign: Campaign;
  lists: ContactListWithCount[];
  senderEmails: SenderEmail[];
}) {
  const [loading, setLoading] = useState(false);
  const [fromEmailId, setFromEmailId] = useState<string>(campaign.from_email_id || "");
  const [abEnabled, setAbEnabled] = useState(!!campaign.subject_b);
  const router = useRouter();
  const { toast } = useToast();

  const canEdit = ["draft", "scheduled"].includes(campaign.status);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CampaignInput>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: campaign.name,
      subject: campaign.subject,
      subject_b: campaign.subject_b || "",
      body: campaign.body,
      list_id: campaign.list_id || "",
      scheduled_at: campaign.scheduled_at
        ? new Date(campaign.scheduled_at).toISOString().slice(0, 16)
        : "",
    },
  });

  async function onSubmit(data: CampaignInput) {
    setLoading(true);
    const supabase = createClient();

    const { error: campaignError } = await supabase
      .from("campaigns")
      .update({
        name: data.name,
        subject: data.subject,
        subject_b: abEnabled ? data.subject_b || null : null,
        body: data.body,
        from_email_id: fromEmailId || null,
        list_id: data.list_id,
        scheduled_at: data.scheduled_at ? new Date(data.scheduled_at).toISOString() : null,
      })
      .eq("id", campaign.id);

    if (campaignError) {
      toast({ title: "Error", description: campaignError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Update campaign_contacts from the new list
    await supabase.from("campaign_contacts").delete().eq("campaign_id", campaign.id);

    const { data: listContacts } = await supabase
      .from("list_contacts")
      .select("contact_id")
      .eq("list_id", data.list_id);

    if (listContacts && listContacts.length > 0) {
      const campaignContacts = listContacts.map((lc) => ({
        campaign_id: campaign.id,
        contact_id: lc.contact_id,
      }));
      await supabase.from("campaign_contacts").insert(campaignContacts);
    }

    toast({ title: "Campaign updated" });
    router.push(`/campaigns/${campaign.id}`);
    router.refresh();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {!canEdit && (
        <div className="p-3 text-sm text-yellow-800 bg-yellow-50 rounded-md">
          This campaign has already been sent. Only draft or scheduled campaigns can be edited.
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Campaign Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Campaign Name</Label>
            <Input id="name" {...register("name")} disabled={!canEdit} />
            {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">Subject Line{abEnabled ? " A" : ""}</Label>
            <Input id="subject" {...register("subject")} disabled={!canEdit} />
            {errors.subject && <p className="text-sm text-red-600">{errors.subject.message}</p>}
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ab-test" checked={abEnabled} onChange={(e) => setAbEnabled(e.target.checked)} className="h-4 w-4" />
              <Label htmlFor="ab-test" className="cursor-pointer">Enable A/B Testing</Label>
            </div>
          )}
          {abEnabled && (
            <div className="space-y-2">
              <Label htmlFor="subject_b">Subject Line B</Label>
              <Input id="subject_b" {...register("subject_b")} disabled={!canEdit} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="body">Email Body</Label>
            <p className="text-xs text-muted-foreground">
              Use {"{{first_name}}"}, {"{{last_name}}"}, {"{{name}}"}, {"{{company}}"}, {"{{role}}"}, {"{{email}}"} for personalization
            </p>
            <Textarea id="body" rows={10} {...register("body")} disabled={!canEdit} />
            {errors.body && <p className="text-sm text-red-600">{errors.body.message}</p>}
          </div>
        </CardContent>
      </Card>

      {/* List selection */}
      <Card>
        <CardHeader><CardTitle>Recipients</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="list_id">Select a List</Label>
            <select
              id="list_id"
              {...register("list_id")}
              disabled={!canEdit}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Choose a list...</option>
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} ({list.contact_count} contacts)
                </option>
              ))}
            </select>
            {errors.list_id && <p className="text-sm text-red-600">{errors.list_id.message}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Sender */}
      {canEdit && senderEmails.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Sender</CardTitle></CardHeader>
          <CardContent>
            <select
              value={fromEmailId}
              onChange={(e) => setFromEmailId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Auto-rotate</option>
              {senderEmails.map((s) => (
                <option key={s.id} value={s.id}>{s.name} &lt;{s.email}&gt;</option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      {/* Schedule */}
      {canEdit && campaign.status === "scheduled" && (
        <Card>
          <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="scheduled_at">Send Date & Time</Label>
              <Input id="scheduled_at" type="datetime-local" {...register("scheduled_at")} />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        {canEdit && (
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => router.push(`/campaigns/${campaign.id}`)}>
          {canEdit ? "Cancel" : "Back"}
        </Button>
      </div>
    </form>
  );
}
