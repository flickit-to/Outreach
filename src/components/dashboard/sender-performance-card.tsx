import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail } from "lucide-react";

export interface SenderRow {
  email: string;
  name: string;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

export function SenderPerformanceCard({ rows }: { rows: SenderRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Sender Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No sender data yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Sender Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 px-2 text-left text-xs font-medium text-muted-foreground">Sender</th>
                <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">Sent</th>
                <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">Open Rate</th>
                <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">Click Rate</th>
                <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">Bounce Rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.email} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 px-2">
                    <div>
                      <p className="font-medium privacy-blur">{row.name}</p>
                      <p className="text-xs text-muted-foreground privacy-blur">{row.email}</p>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right font-medium">{row.sent}</td>
                  <td className="py-2 px-2 text-right">
                    <span className={`font-medium ${row.openRate >= 50 ? "text-green-600" : row.openRate >= 30 ? "text-yellow-600" : "text-red-600"}`}>
                      {row.openRate}%
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <span className={`font-medium ${row.clickRate >= 10 ? "text-green-600" : row.clickRate >= 5 ? "text-yellow-600" : "text-muted-foreground"}`}>
                      {row.clickRate}%
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <span className={`font-medium ${row.bounceRate === 0 ? "text-green-600" : "text-red-600"}`}>
                      {row.bounceRate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
