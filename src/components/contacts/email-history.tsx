"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Eye,
  MousePointerClick,
  AlertTriangle,
  CheckCircle,
  MessageSquare,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

const STATUS_STYLE: Record<string, { label: string; classes: string }> = {
  pending: { label: "Pending", classes: "bg-gray-100 text-gray-700" },
  sent: { label: "Sent", classes: "bg-blue-100 text-blue-700" },
  delivered: { label: "Delivered", classes: "bg-indigo-100 text-indigo-700" },
  opened: { label: "Opened", classes: "bg-yellow-100 text-yellow-800" },
  clicked: { label: "Clicked", classes: "bg-green-100 text-green-700" },
  replied: { label: "Replied", classes: "bg-teal-100 text-teal-700" },
  bounced: { label: "Bounced", classes: "bg-red-100 text-red-700" },
  failed: { label: "Failed", classes: "bg-red-100 text-red-700" },
};

const EVENT_ICON: Record<string, { icon: typeof Mail; color: string }> = {
  sent: { icon: Mail, color: "text-blue-600" },
  delivered: { icon: CheckCircle, color: "text-indigo-600" },
  opened: { icon: Eye, color: "text-yellow-600" },
  clicked: { icon: MousePointerClick, color: "text-green-600" },
  bounced: { icon: AlertTriangle, color: "text-red-600" },
  replied: { icon: MessageSquare, color: "text-teal-600" },
};

export type EmailHistoryEvent = {
  id: string;
  type: string;
  created_at: string;
  metadata?: any;
};

export type EmailHistoryItem = {
  id: string;
  subject: string | null;
  body: string | null;
  from_email_address: string | null;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  replied_at: string | null;
  bounced_at: string | null;
  source: { kind: "sequence"; name: string | null } | { kind: "campaign"; name: string | null } | { kind: "unknown" };
  events: EmailHistoryEvent[];
};

export function EmailHistory({ items }: { items: EmailHistoryItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-4">
        No emails sent to this contact yet.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <EmailHistoryCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function EmailHistoryCard({ item }: { item: EmailHistoryItem }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_STYLE[item.status] || STATUS_STYLE.sent;
  const when = item.sent_at || item.delivered_at;
  const sourceLabel =
    item.source.kind === "sequence"
      ? `Sequence · ${item.source.name || "(unnamed)"}`
      : item.source.kind === "campaign"
        ? `Campaign · ${item.source.name || "(unnamed)"}`
        : "Direct";

  return (
    <div className="rounded-md border bg-card">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors rounded-t-md"
      >
        <Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">
              {item.subject || "(no subject)"}
            </span>
            <Badge variant="secondary" className={`${status.classes} text-[10px] px-1.5 py-0`}>
              {status.label}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
            <span>{when ? formatDateTime(when) : "—"}</span>
            <span>·</span>
            <span className="font-mono">from {item.from_email_address || "(unknown)"}</span>
            <span>·</span>
            <span>{sourceLabel}</span>
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        )}
      </button>

      {expanded && (
        <div className="border-t px-3 py-3 space-y-3 bg-muted/20">
          {/* Body */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Body</p>
            {item.body ? (
              <div className="text-sm whitespace-pre-wrap font-mono bg-background border rounded p-2 max-h-64 overflow-y-auto">
                {item.body}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">(body not stored)</p>
            )}
          </div>

          {/* Events */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Activity ({item.events.length})
            </p>
            {item.events.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No engagement events tracked yet.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {item.events.map((ev) => {
                  const cfg = EVENT_ICON[ev.type] || EVENT_ICON.sent;
                  const Icon = cfg.icon;
                  const url = ev.metadata?.url;
                  return (
                    <li key={ev.id} className="flex items-start gap-2 text-xs">
                      <Icon className={`h-3.5 w-3.5 mt-0.5 ${cfg.color} shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium capitalize">{ev.type}</span>
                        {url && (
                          <span className="text-muted-foreground"> — {url}</span>
                        )}
                        <span className="text-muted-foreground"> · {formatDateTime(ev.created_at)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
