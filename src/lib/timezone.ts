/**
 * Convert a local datetime string (from datetime-local input) to UTC ISO,
 * interpreting the input as being in the specified timezone.
 *
 * Example: "2026-04-14T17:00" in "Australia/Sydney" → "2026-04-14T07:00:00.000Z"
 */
export function zonedTimeToUtc(localDateTime: string, timeZone: string): string {
  if (!localDateTime) return "";

  // Ensure we have seconds
  const normalized = localDateTime.length === 16 ? localDateTime + ":00" : localDateTime;

  // Treat the input as UTC first
  const asUtc = new Date(normalized + "Z");

  // Format that "fake UTC" date in the target timezone to see what it displays as
  const tzStr = asUtc.toLocaleString("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Parse "04/14/2026, 17:00:00" → components
  const match = tzStr.match(/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+):(\d+)/);
  if (!match) return asUtc.toISOString();

  const [, month, day, year, hour, minute, second] = match;
  const shownAsUtc = Date.UTC(
    +year,
    +month - 1,
    +day,
    +hour === 24 ? 0 : +hour,
    +minute,
    +second
  );

  // Difference = timezone offset at that moment
  const offsetMs = shownAsUtc - asUtc.getTime();

  // Subtract the offset to get real UTC
  return new Date(asUtc.getTime() - offsetMs).toISOString();
}

/**
 * Get the user's browser timezone.
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/**
 * Common timezones to offer in a dropdown.
 */
export const COMMON_TIMEZONES = [
  { value: "Pacific/Auckland", label: "Auckland (NZST)" },
  { value: "Australia/Sydney", label: "Sydney / Melbourne (AEST)" },
  { value: "Australia/Brisbane", label: "Brisbane (AEST)" },
  { value: "Australia/Perth", label: "Perth (AWST)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris / Berlin (CET)" },
  { value: "America/New_York", label: "New York (EST/EDT)" },
  { value: "America/Chicago", label: "Chicago (CST/CDT)" },
  { value: "America/Denver", label: "Denver (MST/MDT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PST/PDT)" },
  { value: "UTC", label: "UTC" },
];
