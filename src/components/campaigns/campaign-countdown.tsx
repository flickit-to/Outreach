"use client";

import { useEffect, useState } from "react";

interface Props {
  scheduledAt: string;
}

function getTimeLeft(scheduledAt: string): {
  text: string;
  isPast: boolean;
} {
  const now = Date.now();
  const target = new Date(scheduledAt).getTime();
  const diff = target - now;

  if (diff <= 0) {
    return { text: "Waiting for cron (9 AM UTC)", isPast: true };
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return { text: `in ${days}d ${hours % 24}h`, isPast: false };
  }
  if (hours > 0) {
    return { text: `in ${hours}h ${minutes % 60}m`, isPast: false };
  }
  if (minutes > 0) {
    return { text: `in ${minutes}m ${seconds % 60}s`, isPast: false };
  }
  return { text: `in ${seconds}s`, isPast: false };
}

export function CampaignCountdown({ scheduledAt }: Props) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(scheduledAt));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(scheduledAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [scheduledAt]);

  return (
    <span className={`text-xs ${timeLeft.isPast ? "text-orange-600" : "text-blue-600"}`}>
      {timeLeft.text}
    </span>
  );
}
