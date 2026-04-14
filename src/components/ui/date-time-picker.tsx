"use client";

import { useEffect, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

interface Props {
  value: string; // ISO-like "2026-04-14T17:00"
  onChange: (value: string) => void;
  minDate?: Date;
  placeholder?: string;
}

function dateToLocalString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseLocalString(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function DateTimePicker({ value, onChange, minDate, placeholder }: Props) {
  const selected = parseLocalString(value);
  const [now, setNow] = useState(() => new Date());

  // Refresh "now" every minute so time slots stay accurate
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const effectiveMinDate = minDate || now;

  // If selected date is today, restrict time to >= now
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const isSelectedToday = selected && isSameDay(selected, now);
  const minTime = isSelectedToday ? now : new Date(0, 0, 0, 0, 0);
  const maxTime = isSelectedToday
    ? endOfDay
    : new Date(0, 0, 0, 23, 59);

  return (
    <DatePicker
      selected={selected}
      onChange={(date: Date | null) => {
        if (!date) return;
        // If the selected date is today and time is before now, bump to now + 5 min
        if (isSameDay(date, now) && date.getTime() < now.getTime()) {
          const bumped = new Date(now.getTime() + 5 * 60_000);
          onChange(dateToLocalString(bumped));
        } else {
          onChange(dateToLocalString(date));
        }
      }}
      showTimeSelect
      timeFormat="h:mm aa"
      timeIntervals={15}
      dateFormat="MMM d, yyyy — h:mm aa"
      minDate={effectiveMinDate}
      minTime={minTime}
      maxTime={maxTime}
      filterTime={(time: Date) => {
        // Only filter times on the selected day if it's today
        if (!selected) return time.getTime() >= now.getTime();
        if (!isSameDay(selected, now)) return true;
        return time.getTime() >= now.getTime();
      }}
      placeholderText={placeholder || "Pick a date and time"}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      wrapperClassName="w-full"
    />
  );
}
