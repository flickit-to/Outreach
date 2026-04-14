import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";
import { formatDuration } from "@/lib/analytics/time-to-open";

interface Props {
  avgMinutes: number;
  medianMinutes: number;
  totalOpens: number;
  distribution: { label: string; count: number }[];
}

export function TimeToOpenCard({ avgMinutes, medianMinutes, totalOpens, distribution }: Props) {
  const maxCount = Math.max(...distribution.map((d) => d.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Time to Open
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-2xl font-bold">{formatDuration(avgMinutes)}</p>
            <p className="text-xs text-muted-foreground">Average</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{formatDuration(medianMinutes)}</p>
            <p className="text-xs text-muted-foreground">Median</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{totalOpens}</p>
            <p className="text-xs text-muted-foreground">Total Opens</p>
          </div>
        </div>
        <div className="space-y-2">
          {distribution.map((bucket) => (
            <div key={bucket.label} className="flex items-center gap-3 text-sm">
              <span className="w-20 text-muted-foreground text-xs">{bucket.label}</span>
              <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full transition-all"
                  style={{ width: `${(bucket.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right text-xs font-medium">{bucket.count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
