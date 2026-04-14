import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ABStats {
  total: number;
  opened: number;
  clicked: number;
}

export function ABComparison({
  subjectA,
  subjectB,
  statsA,
  statsB,
}: {
  subjectA: string;
  subjectB: string;
  statsA: ABStats;
  statsB: ABStats;
}) {
  const openRateA = statsA.total > 0 ? Math.round((statsA.opened / statsA.total) * 100) : 0;
  const openRateB = statsB.total > 0 ? Math.round((statsB.opened / statsB.total) * 100) : 0;
  const clickRateA = statsA.total > 0 ? Math.round((statsA.clicked / statsA.total) * 100) : 0;
  const clickRateB = statsB.total > 0 ? Math.round((statsB.clicked / statsB.total) * 100) : 0;

  const winnerOpen = openRateA > openRateB ? "A" : openRateB > openRateA ? "B" : "tie";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          A/B Test Results
          {winnerOpen !== "tie" && (
            <Badge className="bg-green-100 text-green-800">
              Variant {winnerOpen} wins on opens
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Variant A */}
          <div className={`p-4 rounded-lg border-2 ${winnerOpen === "A" ? "border-green-500" : "border-muted"}`}>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="font-bold">A</Badge>
              {winnerOpen === "A" && <Badge className="bg-green-100 text-green-800 text-xs">Winner</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{subjectA}</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Recipients</span>
                <span className="font-medium">{statsA.total}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Open Rate</span>
                <span className="font-medium">{openRateA}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Click Rate</span>
                <span className="font-medium">{clickRateA}%</span>
              </div>
            </div>
          </div>

          {/* Variant B */}
          <div className={`p-4 rounded-lg border-2 ${winnerOpen === "B" ? "border-green-500" : "border-muted"}`}>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="font-bold">B</Badge>
              {winnerOpen === "B" && <Badge className="bg-green-100 text-green-800 text-xs">Winner</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{subjectB}</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Recipients</span>
                <span className="font-medium">{statsB.total}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Open Rate</span>
                <span className="font-medium">{openRateB}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Click Rate</span>
                <span className="font-medium">{clickRateB}%</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
