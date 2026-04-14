import type { Send } from "@/lib/types";

interface TimeToOpenResult {
  avgMinutes: number;
  medianMinutes: number;
  totalOpens: number;
  distribution: { label: string; count: number }[];
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) return "< 1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

export function computeTimeToOpen(sends: Send[]): TimeToOpenResult {
  const timesMinutes: number[] = [];

  for (const send of sends) {
    if (send.sent_at && send.opened_at) {
      const diff = new Date(send.opened_at).getTime() - new Date(send.sent_at).getTime();
      if (diff > 0) {
        timesMinutes.push(diff / 60000);
      }
    }
  }

  if (timesMinutes.length === 0) {
    return {
      avgMinutes: 0,
      medianMinutes: 0,
      totalOpens: 0,
      distribution: [],
    };
  }

  // Average
  const sum = timesMinutes.reduce((a, b) => a + b, 0);
  const avgMinutes = sum / timesMinutes.length;

  // Median
  const sorted = [...timesMinutes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMinutes =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  // Distribution buckets
  const buckets = [
    { label: "< 30 min", max: 30, count: 0 },
    { label: "30m - 1h", max: 60, count: 0 },
    { label: "1 - 2 hrs", max: 120, count: 0 },
    { label: "2 - 6 hrs", max: 360, count: 0 },
    { label: "6 - 24 hrs", max: 1440, count: 0 },
    { label: "> 24 hrs", max: Infinity, count: 0 },
  ];

  for (const minutes of timesMinutes) {
    for (const bucket of buckets) {
      if (minutes < bucket.max) {
        bucket.count++;
        break;
      }
    }
  }

  return {
    avgMinutes,
    medianMinutes,
    totalOpens: timesMinutes.length,
    distribution: buckets.map((b) => ({ label: b.label, count: b.count })),
  };
}
