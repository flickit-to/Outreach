"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mail, RefreshCw, Trash2, CheckCircle, AlertCircle, Plus } from "lucide-react";
import { disconnectOutlook, syncOutlookNow } from "@/app/(dashboard)/settings/integrations/actions";

type Conn = {
  id: string;
  mailbox_address: string;
  display_name: string | null;
  status: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
};

export function OutlookIntegration({ connections }: { connections: Conn[] }) {
  const router = useRouter();
  const search = useSearchParams();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  // Handle ?integration=outlook&connected=1 / &error=…
  const justConnected = search.get("integration") === "outlook" && search.get("connected") === "1";
  const error = search.get("integration") === "outlook" ? search.get("error") : null;

  if (justConnected || error) {
    setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("integration");
      url.searchParams.delete("connected");
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }, 50);
  }

  const fmt = (iso: string | null) => {
    if (!iso) return "never";
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const min = Math.round(diff / 60_000);
    const hr = Math.round(diff / 3_600_000);
    const day = Math.round(diff / 86_400_000);
    if (min < 60) return `${min}m ago`;
    if (hr < 24) return `${hr}h ago`;
    return `${day}d ago`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Outlook integration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {justConnected && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2 flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Outlook connected. You can sync messages now.
          </div>
        )}
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Connect your Outlook mailbox. The app will sync messages tagged{" "}
          <span className="font-mono bg-muted px-1 rounded">Outreach</span> in
          Outlook and replies from contacts already in your CRM. Replies from
          contacts auto-mark them as <em>Replied</em> and exit them from active
          sequences.
        </p>

        {connections.length === 0 ? (
          <div>
            <a href="/api/auth/microsoft/start">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Connect Outlook
              </Button>
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            {connections.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between border rounded p-3"
              >
                <div className="min-w-0">
                  <div className="font-medium">{c.display_name || c.mailbox_address}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">{c.mailbox_address}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Status: {c.status} · last sync {fmt(c.last_sync_at)}
                    {c.last_sync_status && c.last_sync_status !== "ok" && (
                      <span className="text-red-600"> ({c.last_sync_status})</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={async () => {
                      setBusy(c.id);
                      const r = await syncOutlookNow(c.id);
                      setBusy(null);
                      if (!r.ok) {
                        toast({ title: "Sync failed", description: r.error, variant: "destructive" });
                        return;
                      }
                      const res = r.results![0];
                      toast({
                        title: "Sync complete",
                        description: `${res.activities_created} new · ${res.contacts_created} contacts · ${res.replies_marked} marked replied`,
                      });
                      router.refresh();
                    }}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${busy === c.id ? "animate-spin" : ""}`} />
                    Sync now
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={async () => {
                      if (!confirm(`Disconnect ${c.mailbox_address}?`)) return;
                      setBusy(c.id);
                      const r = await disconnectOutlook(c.id);
                      setBusy(null);
                      if (!r.ok) {
                        toast({ title: "Failed", description: r.error, variant: "destructive" });
                        return;
                      }
                      toast({ title: "Disconnected" });
                      router.refresh();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Disconnect
                  </Button>
                </div>
              </div>
            ))}
            <a href="/api/auth/microsoft/start">
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Connect another mailbox
              </Button>
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
