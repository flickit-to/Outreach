"use client";

import { useState, useMemo } from "react";
import type { Contact } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { MarkRepliedButton } from "./mark-replied-button";
import { ClientDateTime } from "@/components/ui/client-date-time";
import { getStatusColor } from "@/lib/utils";
import {
  Search,
  Type,
  AtSign,
  Mail,
  ArrowUp,
  ArrowDown,
  Copy,
} from "lucide-react";

interface SendWithDetails {
  id: string;
  status: string;
  variant: string;
  from_email_address: string | null;
  sender_email_id: string | null;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  contacts: Contact;
  sender?: { id: string; email: string; name: string } | null;
}

interface Props {
  sends: SendWithDetails[];
  hasAB: boolean;
}

type SortKey = "contact" | "sender" | "status" | "sent_at" | "opened_at" | "clicked_at";
type SortDir = "asc" | "desc";

export function CampaignRecipientsTable({ sends, hasAB }: Props) {
  const [search, setSearch] = useState("");
  const [filterDay, setFilterDay] = useState("all");
  const [filterSender, setFilterSender] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("sent_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Extract unique days
  const days = useMemo(() => {
    const daySet = new Map<string, string>();
    sends.forEach((s) => {
      if (!s.sent_at) return;
      const d = new Date(s.sent_at);
      const key = d.toLocaleDateString("en-CA");
      if (!daySet.has(key)) {
        daySet.set(key, d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
      }
    });
    return Array.from(daySet.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [sends]);

  // Extract unique senders
  const senders = useMemo(() => {
    const set = new Map<string, string>();
    sends.forEach((s) => {
      if (s.from_email_address) {
        set.set(s.from_email_address, s.sender?.name || s.from_email_address);
      }
    });
    return Array.from(set.entries());
  }, [sends]);

  // Per-sender stats
  const senderStats = useMemo(() => {
    const map = new Map<string, { email: string; name: string; sent: number; opened: number; clicked: number; bounced: number }>();
    sends.forEach((s) => {
      const key = s.from_email_address || "unknown";
      if (!map.has(key)) map.set(key, { email: key, name: s.sender?.name || key, sent: 0, opened: 0, clicked: 0, bounced: 0 });
      const stat = map.get(key)!;
      if (!["pending", "failed"].includes(s.status)) stat.sent++;
      if (["opened", "clicked", "replied"].includes(s.status)) stat.opened++;
      if (s.status === "clicked") stat.clicked++;
      if (s.status === "bounced") stat.bounced++;
    });
    return Array.from(map.values());
  }, [sends]);

  // Filter + sort
  const filtered = useMemo(() => {
    let result = sends.filter((s) => {
      const contact = s.contacts;
      const matchSearch = !search ||
        (contact?.first_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (contact?.last_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (contact?.email || "").toLowerCase().includes(search.toLowerCase());
      const matchDay = filterDay === "all" || (s.sent_at && new Date(s.sent_at).toLocaleDateString("en-CA") === filterDay);
      const matchSender = filterSender === "all" || s.from_email_address === filterSender;
      const matchStatus = filterStatus === "all" || s.status === filterStatus;
      return matchSearch && matchDay && matchSender && matchStatus;
    });

    result = [...result].sort((a, b) => {
      let av: string | number = 0;
      let bv: string | number = 0;
      switch (sortKey) {
        case "contact": av = (a.contacts?.first_name || "").toLowerCase(); bv = (b.contacts?.first_name || "").toLowerCase(); break;
        case "sender": av = a.from_email_address || ""; bv = b.from_email_address || ""; break;
        case "status": av = a.status; bv = b.status; break;
        case "sent_at": av = a.sent_at || ""; bv = b.sent_at || ""; break;
        case "opened_at": av = a.opened_at || ""; bv = b.opened_at || ""; break;
        case "clicked_at": av = a.clicked_at || ""; bv = b.clicked_at || ""; break;
      }
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [sends, search, filterDay, filterSender, filterStatus, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-500 inline ml-1" /> : <ArrowDown className="h-3 w-3 text-blue-500 inline ml-1" />;
  }

  return (
    <div className="space-y-4">
      {/* Per-sender stats strip */}
      {senderStats.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {senderStats.map((s) => (
            <div key={s.email} className="flex items-center gap-2 px-3 py-2 rounded-md border text-xs">
              <span className="font-medium privacy-blur">{s.name}</span>
              <span className="text-muted-foreground">|</span>
              <span>{s.sent} sent</span>
              <span className="text-yellow-600">{s.sent > 0 ? Math.round((s.opened / s.sent) * 100) : 0}% open</span>
              <span className="text-green-600">{s.sent > 0 ? Math.round((s.clicked / s.sent) * 100) : 0}% click</span>
              {s.bounced > 0 && <span className="text-red-600">{s.bounced} bounced</span>}
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[150px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 h-8 text-sm border rounded-md px-3 bg-background"
          />
        </div>
        <select
          value={filterDay}
          onChange={(e) => setFilterDay(e.target.value)}
          className="h-8 text-xs border rounded-md px-2 bg-background"
        >
          <option value="all">All Days</option>
          {days.map(([key, label], idx) => (
            <option key={key} value={key}>Day {idx + 1} ({label})</option>
          ))}
        </select>
        {senders.length > 1 && (
          <select
            value={filterSender}
            onChange={(e) => setFilterSender(e.target.value)}
            className="h-8 text-xs border rounded-md px-2 bg-background"
          >
            <option value="all">All Senders</option>
            {senders.map(([email, name]) => (
              <option key={email} value={email}>{name}</option>
            ))}
          </select>
        )}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-8 text-xs border rounded-md px-2 bg-background"
        >
          <option value="all">All Statuses</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="opened">Opened</option>
          <option value="clicked">Clicked</option>
          <option value="bounced">Bounced</option>
          <option value="replied">Replied</option>
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length} of {sends.length}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border-t border-b">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="py-1.5 px-2 text-left border-r border-border/40">
                <button onClick={() => toggleSort("contact")} className="text-xs font-normal text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <Type className="h-3.5 w-3.5" /> Contact <SortIcon col="contact" />
                </button>
              </th>
              <th className="py-1.5 px-2 text-left border-r border-border/40">
                <button onClick={() => toggleSort("sender")} className="text-xs font-normal text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <AtSign className="h-3.5 w-3.5" /> Email <SortIcon col="sender" />
                </button>
              </th>
              {senders.length > 1 && (
                <th className="py-1.5 px-2 text-left border-r border-border/40">
                  <button onClick={() => toggleSort("sender")} className="text-xs font-normal text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" /> Sender <SortIcon col="sender" />
                  </button>
                </th>
              )}
              {hasAB && <th className="py-1.5 px-2 text-center border-r border-border/40 text-xs font-normal text-muted-foreground">Variant</th>}
              <th className="py-1.5 px-2 text-left border-r border-border/40">
                <button onClick={() => toggleSort("status")} className="text-xs font-normal text-muted-foreground hover:text-foreground flex items-center gap-1">
                  Status <SortIcon col="status" />
                </button>
              </th>
              <th className="py-1.5 px-2 text-left border-r border-border/40">
                <button onClick={() => toggleSort("sent_at")} className="text-xs font-normal text-muted-foreground hover:text-foreground flex items-center gap-1">
                  Sent At <SortIcon col="sent_at" />
                </button>
              </th>
              <th className="py-1.5 px-2 text-left border-r border-border/40">
                <button onClick={() => toggleSort("opened_at")} className="text-xs font-normal text-muted-foreground hover:text-foreground flex items-center gap-1">
                  Opened At <SortIcon col="opened_at" />
                </button>
              </th>
              <th className="py-1.5 px-2 text-left border-r border-border/40">
                <button onClick={() => toggleSort("clicked_at")} className="text-xs font-normal text-muted-foreground hover:text-foreground flex items-center gap-1">
                  Clicked At <SortIcon col="clicked_at" />
                </button>
              </th>
              <th className="py-1.5 px-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={hasAB ? 9 : 8} className="py-8 text-center text-sm text-muted-foreground">
                  No recipients match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((send) => {
                const contact = send.contacts;
                return (
                  <tr key={send.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors group">
                    <td className="py-1.5 px-2 border-r border-border/40 text-sm font-medium privacy-blur">
                      {[contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="py-1.5 px-2 border-r border-border/40 text-sm text-muted-foreground">
                      <span className="privacy-blur">{contact?.email}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(contact?.email || "");
                        }}
                        className="ml-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 inline-flex"
                        title="Copy email"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </td>
                    {senders.length > 1 && (
                      <td className="py-1.5 px-2 border-r border-border/40 text-xs text-muted-foreground privacy-blur">
                        {send.sender?.name || send.from_email_address || "—"}
                      </td>
                    )}
                    {hasAB && (
                      <td className="py-1.5 px-2 border-r border-border/40 text-center">
                        <Badge variant="outline" className="text-xs">{send.variant || "A"}</Badge>
                      </td>
                    )}
                    <td className="py-1.5 px-2 border-r border-border/40">
                      <Badge variant="secondary" className={`text-xs ${getStatusColor(send.status)}`}>
                        {send.status}
                      </Badge>
                    </td>
                    <td className="py-1.5 px-2 border-r border-border/40 text-xs"><ClientDateTime value={send.sent_at} /></td>
                    <td className="py-1.5 px-2 border-r border-border/40 text-xs"><ClientDateTime value={send.opened_at} /></td>
                    <td className="py-1.5 px-2 border-r border-border/40 text-xs"><ClientDateTime value={send.clicked_at} /></td>
                    <td className="py-1.5 px-2">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <MarkRepliedButton sendId={send.id} currentStatus={send.status} />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground">{filtered.length} of {sends.length} recipients</div>
    </div>
  );
}
