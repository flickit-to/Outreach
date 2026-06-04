"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Send, UserPlus, CheckCircle, AlertCircle } from "lucide-react";
import { sendComposedEmail } from "@/app/(dashboard)/contacts/send-email-actions";
import { SignaturePreview } from "@/components/compose/signature-preview";

export function ComposeForm({
  outlookConnections,
  signatureHtml,
  signatureImageUrl,
}: {
  outlookConnections: { id: string; mailbox_address: string }[];
  signatureHtml: string | null;
  signatureImageUrl: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [trackOpens, setTrackOpens] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);
  const [includeSignature, setIncludeSignature] = useState(true);
  const [connectionId, setConnectionId] = useState(outlookConnections[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<
    | { ok: true; created: boolean; contactId: string; mailbox: string }
    | { ok: false; error: string }
    | null
  >(null);

  const noConnection = outlookConnections.length === 0;

  const onSend = async () => {
    setBusy(true);
    setLastResult(null);
    const r = await sendComposedEmail({
      to,
      subject,
      body,
      trackOpens,
      trackClicks,
      includeSignature,
      connectionId: connectionId || undefined,
    });
    setBusy(false);
    if (!r.ok) {
      setLastResult({ ok: false, error: r.error });
      toast({ title: "Send failed", description: r.error, variant: "destructive" });
      return;
    }
    setLastResult({
      ok: true,
      created: r.contactCreated,
      contactId: r.contactId,
      mailbox: r.mailbox,
    });
    toast({
      title: r.contactCreated ? "Sent + contact added" : "Sent",
      description: `${r.mailbox} → ${to.trim()}`,
    });
    // Clear for the next compose
    setTo("");
    setSubject("");
    setBody("");
    router.refresh();
  };

  if (noConnection) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect Outlook first</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            You need a connected Outlook mailbox before you can send tracked emails.
            Connect one in Settings → Outlook integration.
          </p>
          <Button onClick={() => router.push("/settings")}>Go to Settings</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {lastResult?.ok && lastResult.created && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3 flex items-start gap-2">
          <UserPlus className="h-4 w-4 mt-0.5" />
          <div>
            <div className="font-medium">Sent + contact added</div>
            <div className="text-xs">
              New contact auto-created from the To address.{" "}
              <a href={`/contacts/${lastResult.contactId}`} className="underline">
                Open contact
              </a>
            </div>
          </div>
        </div>
      )}
      {lastResult?.ok && !lastResult.created && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3 flex items-start gap-2">
          <CheckCircle className="h-4 w-4 mt-0.5" />
          <div>
            Sent to existing contact.{" "}
            <a href={`/contacts/${lastResult.contactId}`} className="underline">
              Open contact
            </a>
          </div>
        </div>
      )}
      {lastResult && !lastResult.ok && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{lastResult.error}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Compose</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
            <Label htmlFor="to" className="text-xs">To</Label>
            <Input
              id="to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder='someone@company.com or "Name <someone@company.com>"'
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              If this email isn&apos;t in your contacts yet, we&apos;ll add it
              automatically (with company inferred from the domain).
            </p>
          </div>

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
              rows={14}
              className="mt-1"
            />
            {includeSignature && (
              <SignaturePreview
                signatureHtml={signatureHtml}
                signatureImageUrl={signatureImageUrl}
              />
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Plain text. URLs auto-link and get click-tracked.
            </p>
          </div>

          <div className="flex items-center gap-4 text-sm flex-wrap">
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
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeSignature}
                onChange={(e) => setIncludeSignature(e.target.checked)}
                className="h-4 w-4"
              />
              Include signature
            </label>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={onSend}
              disabled={busy || !to.trim() || !subject.trim() || !body.trim()}
            >
              <Send className="h-4 w-4 mr-2" />
              {busy ? "Sending…" : "Send"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
