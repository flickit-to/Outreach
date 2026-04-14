"use client";

import { useEffect, useState } from "react";

/**
 * Renders a date/time in the user's browser timezone.
 * Server renders a placeholder, then client hydrates with local-formatted time.
 */
export function ClientDateTime({ value, fallback = "—" }: { value: string | null | undefined; fallback?: string }) {
  const [formatted, setFormatted] = useState<string>(fallback);

  useEffect(() => {
    if (!value) {
      setFormatted(fallback);
      return;
    }
    const d = new Date(value);
    setFormatted(
      new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(d)
    );
  }, [value, fallback]);

  return <span suppressHydrationWarning>{formatted}</span>;
}

export function ClientDate({ value, fallback = "—" }: { value: string | null | undefined; fallback?: string }) {
  const [formatted, setFormatted] = useState<string>(fallback);
  useEffect(() => {
    if (!value) { setFormatted(fallback); return; }
    setFormatted(
      new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    );
  }, [value, fallback]);
  return <span suppressHydrationWarning>{formatted}</span>;
}
