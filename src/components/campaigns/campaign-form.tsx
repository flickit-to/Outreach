"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { campaignSchema, type CampaignInput } from "@/lib/validators";
import type { ContactListWithCount, SenderEmail } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { zonedTimeToUtc, getBrowserTimezone, COMMON_TIMEZONES } from "@/lib/timezone";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SendDaysPicker } from "./send-days-picker";

export function CampaignForm({
  lists,
  senderEmails,
  userId,
}: {
  lists: ContactListWithCount[];
  senderEmails: SenderEmail[];
  userId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [sendNow, setSendNow] = useState(true);
  const [fromEmailId, setFromEmailId] = useState<string>("");
  const [abEnabled, setAbEnabled] = useState(false);
  const [timezone, setTimezone] = useState(getBrowserTimezone);
  const [scheduledAt, setScheduledAt] = useState("");
  const [sendDays, setSendDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // Sub-campaign detection from query params
  const parentCampaignId = searchParams.get("parent");
  const triggerEngagement = searchParams.get("trigger") as "opened" | "clicked" | "opened_or_clicked" | null;
  const presetName = searchParams.get("name");
  const isSubCampaign = !!parentCampaignId;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CampaignInput>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: presetName || "",
      subject: "",
      subject_b: "",
      body: "",
      list_id: "",
    },
  });

  async function onSubmit(data: CampaignInput) {
    setLoading(true);
    const supabase = createClient();

    // Create campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        user_id: userId,
        name: data.name,
        subject: data.subject,
        subject_b: abEnabled ? data.subject_b || null : null,
        body: data.body,
        from_email_id: fromEmailId || null,
        list_id: isSubCampaign ? null : data.list_id || null,
        parent_campaign_id: parentCampaignId || null,
        trigger_engagement: triggerEngagement || null,
        send_days: sendDays,
        status: "scheduled",
        scheduled_at: sendNow
          ? new Date().toISOString()
          : scheduledAt ? zonedTimeToUtc(scheduledAt, timezone) : null,
      })
      .select()
      .single();

    if (campaignError || !campaign) {
      toast({
        title: "Error",
        description: campaignError?.message || "Failed to create campaign",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // For main campaigns: get contacts from the list. Sub-campaigns resolve dynamically at send time.
    if (!isSubCampaign && data.list_id) {
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
    }

    // If send now, trigger immediate send
    if (sendNow) {
      try {
        await fetch(`/api/campaigns/${campaign.id}/send`, { method: "POST" });
      } catch {
        // Will be picked up by cron
      }
    }

    toast({
      title: sendNow ? "Campaign sending" : "Campaign scheduled",
      description: sendNow
        ? `Sending now...`
        : `Scheduled for ${data.scheduled_at}`,
    });

    router.push("/campaigns");
    router.refresh();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Campaign Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Campaign Name</Label>
            <Input id="name" placeholder="Q1 Outreach" {...register("name")} />
            {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">Subject Line{abEnabled ? " A" : ""}</Label>
            <Input id="subject" placeholder="Quick question about {{company}}" {...register("subject")} />
            {errors.subject && <p className="text-sm text-red-600">{errors.subject.message}</p>}
          </div>

          {/* A/B Testing */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ab-test"
              checked={abEnabled}
              onChange={(e) => setAbEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="ab-test" className="cursor-pointer">
              Enable A/B Testing (test two subject lines)
            </Label>
          </div>
          {abEnabled && (
            <div className="space-y-2">
              <Label htmlFor="subject_b">Subject Line B</Label>
              <Input id="subject_b" placeholder="Alternative subject line..." {...register("subject_b")} />
              <p className="text-xs text-muted-foreground">Recipients will be split 50/50</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="body">Email Body</Label>
            <p className="text-xs text-muted-foreground">
              Use {"{{first_name}}"}, {"{{last_name}}"}, {"{{name}}"}, {"{{company}}"}, {"{{role}}"}, {"{{email}}"} for personalization
            </p>
            <Textarea
              id="body"
              placeholder={`Hi {{name}},\n\nI noticed {{company}} is...`}
              rows={10}
              {...register("body")}
            />
            {errors.body && <p className="text-sm text-red-600">{errors.body.message}</p>}
          </div>
        </CardContent>
      </Card>

      {/* List selection (hidden for sub-campaigns) */}
      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isSubCampaign ? (
            <div className="p-3 rounded-md bg-blue-50 border border-blue-200 text-sm">
              <p className="font-medium text-blue-900">Follow-up Campaign</p>
              <p className="text-xs text-blue-700 mt-1">
                Recipients are auto-resolved from the parent campaign at send time.
                Trigger: <strong>{triggerEngagement?.replace("_", " ")}</strong>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="list_id">Select a List</Label>
              <select
                id="list_id"
                {...register("list_id")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          )}
          {!isSubCampaign && lists.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No lists yet.{" "}
              <a href="/lists/new" className="text-primary hover:underline">Create a list</a> first.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sender */}
      {senderEmails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sender</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="from_email">Send From</Label>
              <select
                id="from_email"
                value={fromEmailId}
                onChange={(e) => setFromEmailId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Auto-rotate (spread across all senders)</option>
                {senderEmails.map((sender) => (
                  <option key={sender.id} value={sender.id}>
                    {sender.name} &lt;{sender.email}&gt;
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Auto-rotate cycles through your sender emails.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Schedule */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={sendNow} onChange={() => setSendNow(true)} className="h-4 w-4" />
              <span className="text-sm">Send Now</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={!sendNow} onChange={() => setSendNow(false)} className="h-4 w-4" />
              <span className="text-sm">Schedule for Later</span>
            </label>
          </div>

          <div className="space-y-2 pt-2">
            <Label>Send Days</Label>
            <SendDaysPicker value={sendDays} onChange={setSendDays} />
            <p className="text-xs text-muted-foreground">
              Campaign sends only on selected days. Default: Monday–Friday.
            </p>
          </div>
          {!sendNow && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {!COMMON_TIMEZONES.some((tz) => tz.value === timezone) && (
                    <option value={timezone}>{timezone} (your browser)</option>
                  )}
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Default: your browser timezone ({getBrowserTimezone()})
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduled_at">Send Date & Time</Label>
                <DateTimePicker
                  value={scheduledAt}
                  onChange={setScheduledAt}
                  minDate={new Date()}
                />
                <p className="text-xs text-muted-foreground">
                  Time interpreted in {timezone}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : sendNow ? "Create & Send" : "Schedule Campaign"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/campaigns")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
