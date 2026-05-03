"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LeadStageBadge } from "@/components/contacts/lead-stage-badge";
import { Search } from "lucide-react";

export type EnrollmentRow = {
  id: string;
  status: string;
  next_run_at: string | null;
  exit_reason: string | null;
  contacts: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    lead_stage: string;
    assigned_sender_id: string | null;
  } | null;
  step: { step_order: number; type: string } | null;
};

export function EnrollmentsTableClient({
  enrollments,
  senderById,
}: {
  enrollments: EnrollmentRow[];
  senderById: Record<string, string>;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return enrollments;
    return enrollments.filter((e) => {
      const c = e.contacts;
      if (!c) return false;
      return (
        (c.email || "").toLowerCase().includes(needle) ||
        (c.first_name || "").toLowerCase().includes(needle) ||
        (c.last_name || "").toLowerCase().includes(needle) ||
        (c.lead_stage || "").toLowerCase().includes(needle) ||
        (e.status || "").toLowerCase().includes(needle) ||
        (e.exit_reason || "").toLowerCase().includes(needle)
      );
    });
  }, [enrollments, q]);

  const fmtRelative = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    const diff = d.getTime() - Date.now();
    const abs = Math.abs(diff);
    const min = Math.round(abs / 60_000);
    const hr = Math.round(abs / 3_600_000);
    const day = Math.round(abs / 86_400_000);
    const pretty =
      abs < 60_000 ? "<1m"
        : min < 60 ? `${min}m`
        : hr < 24 ? `${hr}h`
        : `${day}d`;
    return diff > 0 ? `in ${pretty}` : `${pretty} ago`;
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, email, lead stage, status…"
          className="pl-8"
        />
      </div>
      <div className="text-xs text-muted-foreground">
        Showing {filtered.length} of {enrollments.length}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Contact</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Current step</TableHead>
            <TableHead>Next run</TableHead>
            <TableHead>Lead stage</TableHead>
            <TableHead>Locked sender</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((e) => {
            const c = e.contacts;
            const stepLabel = e.step
              ? `${String(e.step.step_order).padStart(2, "0")} · ${e.step.type}`
              : "—";
            const statusBadgeColor =
              e.status === "active" ? "bg-blue-100 text-blue-700"
              : e.status === "completed" ? "bg-green-100 text-green-700"
              : e.status === "exited" ? "bg-gray-100 text-gray-700"
              : e.status === "paused" ? "bg-yellow-100 text-yellow-800"
              : "bg-gray-100 text-gray-700";
            const lockedSenderEmail = c?.assigned_sender_id
              ? senderById[c.assigned_sender_id]
              : null;
            return (
              <TableRow key={e.id}>
                <TableCell>
                  <div className="text-sm">
                    <div className="font-medium">
                      {[c?.first_name, c?.last_name].filter(Boolean).join(" ") || c?.email || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">{c?.email}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={statusBadgeColor}>
                    {e.status}
                  </Badge>
                  {e.exit_reason && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {e.exit_reason}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs font-mono">{stepLabel}</TableCell>
                <TableCell className="text-xs">{fmtRelative(e.next_run_at)}</TableCell>
                <TableCell>
                  {c ? (
                    <LeadStageBadge contactId={c.id} stage={c.lead_stage as any} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {lockedSenderEmail ? (
                    <span className="font-mono text-muted-foreground">{lockedSenderEmail}</span>
                  ) : (
                    <span className="text-muted-foreground italic">unassigned</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {filtered.length === 0 && q && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                No matches for "{q}"
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
