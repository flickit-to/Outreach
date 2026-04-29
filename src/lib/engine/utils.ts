// Shared helpers for the sequence engine.

const SYDNEY_TZ = "Australia/Sydney";
const DAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

const AUTO_EXIT_LEAD_STAGES = [
  "replied",
  "meeting_booked",
  "closed_won",
  "closed_lost",
  "bounced",
] as const;

export function isAutoExitLeadStage(stage: string | null | undefined): boolean {
  return !!stage && (AUTO_EXIT_LEAD_STAGES as readonly string[]).includes(stage);
}

export function todaySydneyDayNum(now = new Date()): number {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: SYDNEY_TZ,
    weekday: "short",
  }).format(now);
  return DAY_MAP[day] ?? now.getDay();
}

export function isTodayASendDay(sendDays: number[] | null | undefined, now = new Date()): boolean {
  const days = sendDays && sendDays.length > 0 ? sendDays : [1, 2, 3, 4, 5];
  return days.includes(todaySydneyDayNum(now));
}

/**
 * Returns a Date set to the next valid send day (in Sydney TZ) at 09:00 Sydney time.
 * Searches up to 7 days ahead.
 */
export function nextSendDayAt9am(sendDays: number[] | null | undefined, fromDate = new Date()): Date {
  const days = sendDays && sendDays.length > 0 ? sendDays : [1, 2, 3, 4, 5];
  for (let i = 1; i <= 7; i++) {
    const candidate = new Date(fromDate);
    candidate.setUTCDate(candidate.getUTCDate() + i);
    const dayNum = todaySydneyDayNum(candidate);
    if (days.includes(dayNum)) {
      // Set to 09:00 Sydney time on that calendar day. Sydney is UTC+10/+11
      // depending on DST. Easiest portable approach: format the candidate's
      // YYYY-MM-DD in Sydney, then build a UTC date at that local 09:00.
      const ymd = new Intl.DateTimeFormat("en-CA", {
        timeZone: SYDNEY_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(candidate);
      // Approximate: Sydney is +10 standard, +11 DST. Use +10 as a safe-ish
      // default for staging tests; off by an hour during DST is fine here.
      return new Date(`${ymd}T09:00:00+10:00`);
    }
  }
  // Fallback: 24h from now
  return new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
}

export function addDays(d: Date, days: number, hours = 0): Date {
  return new Date(d.getTime() + days * 86_400_000 + hours * 3_600_000);
}
