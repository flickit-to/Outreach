import type { SupabaseClient } from "@supabase/supabase-js";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface BestTimeResult {
  bestDay: string;
  bestHour: number;
  dailyCounts: { day: string; count: number }[];
  hourlyCounts: { hour: number; count: number }[];
  totalOpens: number;
}

export async function getBestSendTimes(
  supabase: SupabaseClient
): Promise<BestTimeResult> {
  const { data: events } = await supabase
    .from("events")
    .select("created_at")
    .eq("type", "opened");

  if (!events || events.length === 0) {
    return {
      bestDay: "Not enough data",
      bestHour: 9,
      dailyCounts: DAYS.map((d) => ({ day: d, count: 0 })),
      hourlyCounts: Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 })),
      totalOpens: 0,
    };
  }

  // Count by day and hour
  const dayCounts = new Array(7).fill(0);
  const hourCounts = new Array(24).fill(0);

  for (const event of events) {
    const date = new Date(event.created_at);
    dayCounts[date.getDay()]++;
    hourCounts[date.getHours()]++;
  }

  // Find best day
  const maxDayCount = Math.max(...dayCounts);
  const bestDayIndex = dayCounts.indexOf(maxDayCount);

  // Find best hour
  const maxHourCount = Math.max(...hourCounts);
  const bestHourIndex = hourCounts.indexOf(maxHourCount);

  return {
    bestDay: DAYS[bestDayIndex],
    bestHour: bestHourIndex,
    dailyCounts: DAYS.map((day, i) => ({ day: day.slice(0, 3), count: dayCounts[i] })),
    hourlyCounts: Array.from({ length: 24 }, (_, i) => ({ hour: i, count: hourCounts[i] })),
    totalOpens: events.length,
  };
}

export function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}
