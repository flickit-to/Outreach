"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Calendar } from "lucide-react";

function formatHourLocal(utcHour: number): string {
  // Convert UTC hour to local hour using browser timezone
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", hour12: true });
}

interface Props {
  bestDay: string;
  bestHour: number;
  dailyCounts: { day: string; count: number }[];
  totalOpens: number;
}

export function BestTimesCard({ bestDay, bestHour, dailyCounts, totalOpens }: Props) {
  const maxCount = Math.max(...dailyCounts.map((d) => d.count), 1);

  if (totalOpens === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Best Time to Send
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Not enough data yet. Send some campaigns to see recommendations.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Best Time to Send
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Calendar className="h-8 w-8 text-primary" />
            <div>
              <p className="text-lg font-bold">{bestDay}</p>
              <p className="text-xs text-muted-foreground">Best day</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Clock className="h-8 w-8 text-primary" />
            <div>
              <p className="text-lg font-bold">{formatHourLocal(bestHour)}</p>
              <p className="text-xs text-muted-foreground">Best time</p>
            </div>
          </div>
        </div>

        {/* Daily bar chart */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Opens by day</p>
          <div className="flex items-end gap-1 h-16">
            {dailyCounts.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-primary/80 rounded-t transition-all"
                  style={{
                    height: `${Math.max((d.count / maxCount) * 100, 4)}%`,
                  }}
                />
                <span className="text-[10px] text-muted-foreground">{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Based on {totalOpens} opens
        </p>
      </CardContent>
    </Card>
  );
}
