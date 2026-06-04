"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send } from "lucide-react";
import { sendEmailFromOutlook } from "@/app/(dashboard)/contacts/send-email-actions";

export function SendEmailDialog({
  contactId,
  contactEmail,
  contactName,
  outlookConnections,
}: {
  contactId: string;
  contactEmail: string;
  contactName?: string;
  outlookConnections: { id: string; mailbox_address: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [trackOpens, setTrackOpens] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);
  const [connectionId, setConnectionId] = useState(outlookConnections[0]?.id || "");

  const noConnection = outlookConnections.length === 0;

  const send = async () => {
    setBusy(true);
    const r = await sendEmailFromOutlook({
      contactId,
      subject,
      body,
      trackOpens,
      trackClicks,
      connectionId: connectionId || undefined,
    });
    setBusy(false);
    if (!r.ok) {
      toast({ title: "Send failed", description: r.error, variant: "destructive" });
      return;
    }
    toast({ title: "Email sent", description: `From ${r.mailbox} to ${contactEmail}` });
    setOpen(false);
    setSubject("");
    setBody("");
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={noConnection} title={noConnection ? "Connect Outlook in Settings first" : undefined}>
          <Mail className="h-4 w-4 mr-2" />
          Send email
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send email</DialogTitle>
          <DialogDescription>
            Sent through your Outlook · tracked opens and clicks
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="text-sm">
            <span className="text-muted-foreground">To: </span>
            <span className="font-mono">{contactEmail}</span>
            {contactName && (
              <span className="text-muted-foreground"> ({contactName})</span>
            )}
          </div>

          {outlookConnections.length > 1 && (
            <div>
              <Label htmlFor="from" className="text-xs">From</Label>
              <select
                id="from"
                value={connectionId}
                onChange={(e) => setConnectionId(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                {outlookConnections.map((c) => (
                  <option key={c.id} value={c.id}>{c.mailbox_address}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Label htmlFor="subject" className="text-xs">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What's this about?"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="body" className="text-xs">Body</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi…"
              rows={10}
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Plain text. URLs auto-link and get click-tracked.
            </p>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={trackOpens}
                onChange={(e) => setTrackOpens(e.target.checked)}
                className="h-4 w-4"
              />
              Track opens
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={trackClicks}
                onChange={(e) => setTrackClicks(e.target.checked)}
                className="h-4 w-4"
              />
              Track clicks
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={send} disabled={busy || !subject.trim() || !body.trim()}>
            <Send className="h-4 w-4 mr-2" />
            {busy ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
