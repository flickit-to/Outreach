import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Timer } from "lucide-react";
import { formatDuration } from "@/lib/analytics/time-to-open";

interface Props {
  avgMinutes: number;
  topBucket: string;
  topBucketPct: number;
  totalOpens: number;
}

export function TimeToOpenSummary({ avgMinutes, topBucket, topBucketPct, totalOpens }: Props) {
  if (totalOpens === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Time to Open
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No open data yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Timer className="h-5 w-5" />
          Time to Open
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-2xl font-bold">{formatDuration(avgMinutes)}</p>
          <p className="text-xs text-muted-foreground">Average time to open</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <p className="text-sm">
            <span className="font-medium">{topBucketPct}%</span> of opens happen within{" "}
            <span className="font-medium">{topBucket}</span>
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Based on {totalOpens} opens</p>
      </CardContent>
    </Card>
  );
}
