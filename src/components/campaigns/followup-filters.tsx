"use client";

import { useState, useMemo } from "react";
import { Check } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface ParentSendData {
  contactId: string;
  contactName: string;
  contactEmail: string;
  status: string;
  leadStage?: string;
  sentAt: string;
  day: string;
}

const ENGAGEMENT_OPTIONS = [
  { key: "opened", label: "Opened", color: "bg-yellow-100 text-yellow-800" },
  { key: "clicked", label: "Clicked", color: "bg-green-100 text-green-800" },
  { key: "delivered", label: "Sent (not opened)", color: "bg-blue-100 text-blue-800" },
  { key: "sent", label: "Sent (pending delivery)", color: "bg-gray-100 text-gray-800" },
  { key: "bounced", label: "Bounced", color: "bg-red-100 text-red-800" },
];

const EXCLUDE_OPTIONS = [
  { key: "replied", label: "Replied", color: "bg-teal-100 text-teal-800" },
  { key: "meeting_booked", label: "Meeting Booked", color: "bg-purple-100 text-purple-800" },
  { key: "closed", label: "Closed (Won/Lost)", color: "bg-emerald-100 text-emerald-800" },
];

function matchesEngagement(status: string, filter: string): boolean {
  switch (filter) {
    case "opened": return status === "opened";
    case "clicked": return status === "clicked";
    case "delivered": return status === "delivered";
    case "sent": return status === "sent";
    case "bounced": return status === "bounced";
    default: return false;
  }
}

function matchesExclude(leadStage: string, filter: string): boolean {
  switch (filter) {
    case "replied": return leadStage === "replied";
    case "meeting_booked": return leadStage === "meeting_booked";
    case "closed": return leadStage === "closed_won" || leadStage === "closed_lost";
    default: return false;
  }
}

export function FollowupFilters({
  parentSends,
  onFilteredContactIds,
}: {
  parentSends: ParentSendData[];
  onFilteredContactIds: (ids: string[], trigger: string) => void;
}) {
  const [selectedEngagement, setSelectedEngagement] = useState<Set<string>>(new Set(["opened", "clicked"]));
  const [excludeFilters, setExcludeFilters] = useState<Set<string>>(new Set(["replied", "meeting_booked", "closed"]));
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());

  // Unique days
  const days = useMemo(() => {
    const dayMap = new Map<string, { date: string; count: number }>();
    parentSends.forEach((s) => {
      if (!s.day) return;
      if (!dayMap.has(s.day)) dayMap.set(s.day, { date: s.day, count: 0 });
      dayMap.get(s.day)!.count++;
    });
    return Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val], idx) => ({ key, label: `Day ${idx + 1}`, date: formatDate(val.date), count: val.count }));
  }, [parentSends]);

  // Engagement counts (before exclusions)
  const engagementCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    ENGAGEMENT_OPTIONS.forEach((o) => { counts[o.key] = 0; });
    parentSends.forEach((s) => {
      ENGAGEMENT_OPTIONS.forEach((o) => {
        if (matchesEngagement(s.status, o.key)) counts[o.key]++;
      });
    });
    return counts;
  }, [parentSends]);

  // Exclude counts
  const excludeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    EXCLUDE_OPTIONS.forEach((o) => { counts[o.key] = 0; });
    parentSends.forEach((s) => {
      EXCLUDE_OPTIONS.forEach((o) => {
        if (matchesExclude(s.leadStage || "", o.key)) counts[o.key]++;
      });
    });
    return counts;
  }, [parentSends]);

  // Filtered contacts
  const filteredContacts = useMemo(() => {
    const seen = new Set<string>();
    const result: ParentSendData[] = [];

    parentSends.forEach((s) => {
      if (seen.has(s.contactId)) return;

      // Check exclude filters
      let excluded = false;
      excludeFilters.forEach((ex) => {
        if (matchesExclude(s.leadStage || "", ex)) excluded = true;
      });
      if (excluded) return;

      // Check engagement filter
      let matchEng = false;
      selectedEngagement.forEach((eng) => {
        if (matchesEngagement(s.status, eng)) matchEng = true;
      });
      if (!matchEng) return;

      // Check day filter
      if (selectedDays.size > 0 && !selectedDays.has(s.day)) return;

      seen.add(s.contactId);
      result.push(s);
    });

    return result;
  }, [parentSends, selectedEngagement, excludeFilters, selectedDays]);

  const triggerString = Array.from(selectedEngagement).sort().join(",");

  useMemo(() => {
    onFilteredContactIds(filteredContacts.map((c) => c.contactId), triggerString);
  }, [filteredContacts, triggerString, onFilteredContactIds]);

  function toggleEngagement(key: string) {
    const next = new Set(selectedEngagement);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelectedEngagement(next);
  }

  function toggleExclude(key: string) {
    const next = new Set(excludeFilters);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExcludeFilters(next);
  }

  function toggleDay(key: string) {
    const next = new Set(selectedDays);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelectedDays(next);
  }

  return (
    <div className="space-y-4">
      {/* Include: engagement multi-select */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Include contacts who:</p>
        <div className="flex flex-wrap gap-2">
          {ENGAGEMENT_OPTIONS.map((opt) => {
            const active = selectedEngagement.has(opt.key);
            const count = engagementCounts[opt.key];
            return (
              <button key={opt.key} type="button" onClick={() => toggleEngagement(opt.key)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors ${
                  active ? `${opt.color} border-current font-medium` : "bg-background text-muted-foreground border-input hover:border-foreground"
                }`}
              >
                <div className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center ${active ? "bg-current border-current" : "border-muted-foreground/30"}`}>
                  {active && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                {opt.label}
                <span className="text-xs opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Exclude: replied, meeting booked, closed */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Exclude contacts who:</p>
        <div className="flex flex-wrap gap-2">
          {EXCLUDE_OPTIONS.map((opt) => {
            const active = excludeFilters.has(opt.key);
            const count = excludeCounts[opt.key];
            return (
              <button key={opt.key} type="button" onClick={() => toggleExclude(opt.key)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors ${
                  active ? "bg-red-50 text-red-700 border-red-300 font-medium" : "bg-background text-muted-foreground border-input hover:border-foreground"
                }`}
              >
                <div className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center ${active ? "bg-red-500 border-red-500" : "border-muted-foreground/30"}`}>
                  {active && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                {opt.label}
                {count > 0 && <span className="text-xs opacity-70">({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day multi-select */}
      {days.length > 1 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">From days:</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSelectedDays(new Set())}
              className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                selectedDays.size === 0 ? "bg-primary text-primary-foreground border-primary font-medium" : "bg-background text-muted-foreground border-input hover:border-foreground"
              }`}
            >
              All Days
            </button>
            {days.map((day) => {
              const active = selectedDays.has(day.key);
              return (
                <button key={day.key} type="button" onClick={() => toggleDay(day.key)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors ${
                    active ? "bg-primary text-primary-foreground border-primary font-medium" : "bg-background text-muted-foreground border-input hover:border-foreground"
                  }`}
                >
                  <div className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center ${active ? "bg-white border-white" : "border-muted-foreground/30"}`}>
                    {active && <Check className="h-2.5 w-2.5 text-primary" />}
                  </div>
                  {day.label}
                  <span className="text-xs opacity-70">({day.date})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="p-3 rounded-md bg-muted/50 border">
        <p className="text-sm">
          <span className="font-bold text-lg">{filteredContacts.length}</span>
          <span className="text-muted-foreground ml-2">contacts match your filters</span>
        </p>
        {filteredContacts.length > 0 && filteredContacts.length <= 5 && (
          <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
            {filteredContacts.map((c) => (
              <div key={c.contactId} className="privacy-blur">{c.contactName} ({c.contactEmail})</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
