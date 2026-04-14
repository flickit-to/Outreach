"use client";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

interface Props {
  value: string; // ISO-like "2026-04-14T17:00"
  onChange: (value: string) => void;
  minDate?: Date;
  placeholder?: string;
}

/**
 * Convert Date → "2026-04-14T17:00" (local format for datetime-local / form state).
 */
function dateToLocalString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseLocalString(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function DateTimePicker({ value, onChange, minDate, placeholder }: Props) {
  const selected = parseLocalString(value);

  return (
    <DatePicker
      selected={selected}
      onChange={(date: Date | null) => {
        if (date) onChange(dateToLocalString(date));
      }}
      showTimeSelect
      timeFormat="HH:mm"
      timeIntervals={15}
      dateFormat="MMM d, yyyy — h:mm aa"
      minDate={minDate || new Date()}
      placeholderText={placeholder || "Pick a date and time"}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      wrapperClassName="w-full"
    />
  );
}
