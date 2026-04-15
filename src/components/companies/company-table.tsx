"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { CompanyStats } from "@/app/(dashboard)/companies/page";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Building2,
  Users,
  Mail,
  Eye,
  MousePointerClick,
  MessageSquare,
  AlertTriangle,
  Clock,
  ArrowUp,
  ArrowDown,
  ArrowLeftToLine,
  ArrowRightToLine,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

type SortDir = "asc" | "desc" | null;

interface ColumnDef {
  key: string;
  label: string;
  icon: any;
  align?: "left" | "right";
  sortable: boolean;
}

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: "company", label: "Company", icon: Building2, align: "left", sortable: true },
  { key: "contacts", label: "Contacts", icon: Users, align: "right", sortable: true },
  { key: "sent", label: "Sent", icon: Mail, align: "right", sortable: true },
  { key: "opened", label: "Opened", icon: Eye, align: "right", sortable: true },
  { key: "clicked", label: "Clicked", icon: MousePointerClick, align: "right", sortable: true },
  { key: "replied", label: "Replied", icon: MessageSquare, align: "right", sortable: true },
  { key: "bounced", label: "Bounced", icon: AlertTriangle, align: "right", sortable: true },
  { key: "openRate", label: "Open Rate", icon: Eye, align: "right", sortable: true },
  { key: "clickRate", label: "Click Rate", icon: MousePointerClick, align: "right", sortable: true },
  { key: "lastActivity", label: "Last Activity", icon: Clock, align: "left", sortable: true },
];

function getValue(row: CompanyStats, key: string): string | number {
  switch (key) {
    case "company": return row.company.toLowerCase();
    case "contacts": return row.contacts;
    case "sent": return row.sent;
    case "opened": return row.opened;
    case "clicked": return row.clicked;
    case "replied": return row.replied;
    case "bounced": return row.bounced;
    case "openRate": return row.openRate;
    case "clickRate": return row.clickRate;
    case "lastActivity": return row.lastActivity ? new Date(row.lastActivity).getTime() : 0;
    default: return 0;
  }
}

export function CompanyTable({ companies }: { companies: CompanyStats[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string>("contacts");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [columnOrder, setColumnOrder] = useState<string[]>(DEFAULT_COLUMNS.map((c) => c.key));

  const orderedColumns = useMemo(
    () =>
      columnOrder
        .map((key) => DEFAULT_COLUMNS.find((c) => c.key === key))
        .filter(Boolean) as ColumnDef[],
    [columnOrder]
  );

  const filtered = useMemo(() => {
    let result = companies.filter((c) =>
      c.company.toLowerCase().includes(search.toLowerCase())
    );

    if (sortKey && sortDir) {
      result = [...result].sort((a, b) => {
        const av = getValue(a, sortKey);
        const bv = getValue(b, sortKey);
        if (typeof av === "number" && typeof bv === "number") {
          return sortDir === "asc" ? av - bv : bv - av;
        }
        const cmp = String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [companies, search, sortKey, sortDir]);

  function moveColumn(key: string, direction: "left" | "right") {
    setColumnOrder((prev) => {
      const idx = prev.indexOf(key);
      if (idx === -1) return prev;
      const newIdx = direction === "left" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }

  function renderCell(row: CompanyStats, colKey: string) {
    switch (colKey) {
      case "company":
        return (
          <Link
            href={`/contacts?company=${encodeURIComponent(row.company)}`}
            className="text-sm font-medium hover:underline privacy-blur"
          >
            {row.company}
          </Link>
        );
      case "contacts":
        return <span className="text-sm">{row.contacts}</span>;
      case "sent":
        return <span className="text-sm">{row.sent}</span>;
      case "opened":
        return <span className="text-sm">{row.opened}</span>;
      case "clicked":
        return <span className="text-sm">{row.clicked}</span>;
      case "replied":
        return <span className="text-sm text-teal-600">{row.replied || "—"}</span>;
      case "bounced":
        return <span className="text-sm text-red-600">{row.bounced || "—"}</span>;
      case "openRate":
        return <span className="text-sm font-medium">{row.openRate}%</span>;
      case "clickRate":
        return <span className="text-sm font-medium">{row.clickRate}%</span>;
      case "lastActivity":
        return (
          <span className="text-sm text-muted-foreground">
            {row.lastActivity ? formatRelativeTime(row.lastActivity) : "—"}
          </span>
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-0">
      {/* Top stat */}
      <div className="flex items-center gap-6 border-b py-3">
        <div>
          <p className="text-2xl font-bold">{companies.length}</p>
          <p className="text-xs text-muted-foreground">Companies</p>
        </div>
        <div>
          <p className="text-2xl font-bold">
            {companies.reduce((sum, c) => sum + c.contacts, 0)}
          </p>
          <p className="text-xs text-muted-foreground">Total Contacts</p>
        </div>
        <div>
          <p className="text-2xl font-bold">
            {companies.reduce((sum, c) => sum + c.sent, 0)}
          </p>
          <p className="text-xs text-muted-foreground">Emails Sent</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm border-0 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border-t border-b">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              {orderedColumns.map((col) => {
                const isSorted = sortKey === col.key;
                const colIdx = columnOrder.indexOf(col.key);
                return (
                  <th
                    key={col.key}
                    className={`py-1.5 px-2 text-${col.align} border-r border-border/40`}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={`flex items-center gap-1.5 text-xs font-normal text-muted-foreground hover:text-foreground transition-colors group/col ${
                            col.align === "right" ? "ml-auto" : ""
                          }`}
                        >
                          <col.icon className="h-3.5 w-3.5 shrink-0" />
                          <span>{col.label}</span>
                          {isSorted ? (
                            sortDir === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-blue-500 shrink-0" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-blue-500 shrink-0" />
                            )
                          ) : (
                            <ArrowUp className="h-3 w-3 shrink-0 opacity-0 group-hover/col:opacity-30 transition-opacity" />
                          )}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={col.align === "right" ? "end" : "start"} className="w-48">
                        <DropdownMenuItem onClick={() => { setSortKey(col.key); setSortDir("asc"); }}>
                          <ArrowUp className="h-4 w-4 mr-2" />
                          Sort ascending
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSortKey(col.key); setSortDir("desc"); }}>
                          <ArrowDown className="h-4 w-4 mr-2" />
                          Sort descending
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => moveColumn(col.key, "left")}
                          disabled={colIdx === 0}
                        >
                          <ArrowLeftToLine className="h-4 w-4 mr-2" />
                          Move left
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => moveColumn(col.key, "right")}
                          disabled={colIdx === columnOrder.length - 1}
                        >
                          <ArrowRightToLine className="h-4 w-4 mr-2" />
                          Move right
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length} className="py-12 text-center text-sm text-muted-foreground">
                  {companies.length === 0
                    ? "No companies yet. Add company to your contacts."
                    : "No companies match your search."}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.company} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                  {orderedColumns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-1.5 px-2 border-r border-border/40 text-${col.align}`}
                    >
                      {renderCell(row, col.key)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="py-2 px-2 text-xs text-muted-foreground">
        {filtered.length} of {companies.length} companies
      </div>
    </div>
  );
}
