"use client";

import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { LeadStageBadge } from "@/components/contacts/lead-stage-badge";
import { EmailCell } from "@/components/contacts/email-cell";
import { Building2, Mail, Eye, MousePointerClick, MessageSquare, AlertTriangle } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import type { CompanyStats } from "@/app/(dashboard)/companies/page";

export function CompanySlidePanel({
  company,
  open,
  onOpenChange,
}: {
  company: CompanyStats | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent width="max-w-2xl">
        {company && (
          <>
            <SheetHeader>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="truncate privacy-blur">{company.company}</SheetTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {company.contacts} {company.contacts === 1 ? "contact" : "contacts"}
                    {company.lastActivity && (
                      <> · last activity {formatRelativeTime(company.lastActivity)}</>
                    )}
                  </p>
                </div>
              </div>
            </SheetHeader>

            <SheetBody>
              {/* Health summary */}
              <div className="grid grid-cols-5 gap-2 mt-2 mb-5">
                <Stat icon={Mail} label="Sent" value={company.sent} />
                <Stat icon={Eye} label="Opened" value={company.opened} tone={company.opened > 0 ? "good" : undefined} />
                <Stat icon={MousePointerClick} label="Clicked" value={company.clicked} tone={company.clicked > 0 ? "good" : undefined} />
                <Stat icon={MessageSquare} label="Replied" value={company.replied} tone={company.replied > 0 ? "good" : undefined} />
                <Stat icon={AlertTriangle} label="Bounced" value={company.bounced} tone={company.bounced > 0 ? "bad" : undefined} />
              </div>

              {/* One-line plain-English summary */}
              <PlainSummary company={company} />

              {/* Contact list */}
              <h4 className="mt-6 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Contacts
              </h4>
              <div className="border rounded-md divide-y divide-border/60">
                {company.contactList.map((c) => {
                  const fullName =
                    [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email;
                  return (
                    <div key={c.contact_id} className="px-3 py-2.5 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/contacts/${c.contact_id}`}
                            className="text-sm font-medium hover:underline privacy-blur"
                          >
                            {fullName}
                          </Link>
                          {c.role && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {c.role}
                            </span>
                          )}
                          <div className="mt-1">
                            <EmailCell email={c.email} />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <LeadStageBadge contactId={c.contact_id} stage={c.lead_stage as never} />
                          {c.last_activity && (
                            <div className="text-[10px] text-muted-foreground mt-1">
                              {formatRelativeTime(c.last_activity)}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Per-contact engagement chips */}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {c.sent > 0 && (
                          <ChipMini icon={Mail} label="Sent" value={c.sent} />
                        )}
                        {c.opened > 0 && (
                          <ChipMini icon={Eye} label="Opened" value={c.opened} tone="good" />
                        )}
                        {c.clicked > 0 && (
                          <ChipMini icon={MousePointerClick} label="Clicked" value={c.clicked} tone="good" />
                        )}
                        {c.replied > 0 && (
                          <ChipMini icon={MessageSquare} label="Replied" value={c.replied} tone="good" />
                        )}
                        {c.bounced > 0 && (
                          <ChipMini icon={AlertTriangle} label="Bounced" value={c.bounced} tone="bad" />
                        )}
                        {c.sent === 0 && (
                          <span className="text-[11px] text-muted-foreground italic">
                            Not contacted yet
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4">
                <Link
                  href={`/contacts?company=${encodeURIComponent(company.company)}`}
                  className="text-xs text-primary hover:underline"
                >
                  View all {company.contacts} contacts in Contacts →
                </Link>
              </div>
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "good" | "bad";
}) {
  const colorClass =
    tone === "good"
      ? "text-emerald-600"
      : tone === "bad"
        ? "text-red-600"
        : "text-foreground";
  return (
    <div className="border rounded-md p-2.5 text-center">
      <Icon className={`h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground`} />
      <div className={`text-lg font-semibold ${colorClass}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}

function ChipMini({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "good" | "bad";
}) {
  const cls =
    tone === "good"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "bad"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${cls}`}>
      <Icon className="h-2.5 w-2.5" />
      {label} {value}
    </span>
  );
}

function PlainSummary({ company }: { company: CompanyStats }) {
  const total = company.contacts;
  const sentToCount = company.contactList.filter((c) => c.sent > 0).length;
  const openedCount = company.contactList.filter((c) => c.opened > 0).length;
  const clickedCount = company.contactList.filter((c) => c.clicked > 0).length;
  const repliedCount = company.contactList.filter((c) => c.replied > 0).length;
  const bouncedCount = company.contactList.filter((c) => c.bounced > 0).length;
  const notContactedCount = total - sentToCount;

  const parts: string[] = [];
  parts.push(`${total} ${total === 1 ? "lead" : "leads"} at this company`);
  if (sentToCount > 0) parts.push(`${sentToCount} contacted`);
  if (openedCount > 0) parts.push(`${openedCount} opened`);
  if (clickedCount > 0) parts.push(`${clickedCount} clicked`);
  if (repliedCount > 0) parts.push(`${repliedCount} replied`);
  if (bouncedCount > 0) parts.push(`${bouncedCount} bounced`);
  if (notContactedCount > 0 && sentToCount > 0) {
    parts.push(`${notContactedCount} not contacted yet`);
  }

  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-foreground/80">
      <Badge variant="outline" className="text-[9px] mr-1.5">summary</Badge>
      {parts.join(" · ")}.
    </div>
  );
}
