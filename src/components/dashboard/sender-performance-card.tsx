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
  stickyLocked?: number;
  sent7d?: number;
  dailyLimit?: number;
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
                <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground" title="Contacts permanently locked to this sender — once a contact gets an email from a sender, all their future sends use the same one.">Sticky locks</th>
                <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground" title="Total sends ever made from this sender.">Sent</th>
                <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground" title="Sends from this sender in the last 7 days.">Last 7d</th>
                <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">Open</th>
                <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">Click</th>
                <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">Bounce</th>
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
                  <td className="py-2 px-2 text-right">
                    {row.stickyLocked !== undefined ? (
                      <span className="font-medium">{row.stickyLocked}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right font-medium">{row.sent}</td>
                  <td className="py-2 px-2 text-right">
                    {row.sent7d !== undefined ? (
                      <span className="text-muted-foreground">{row.sent7d}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {row.dailyLimit !== undefined && (
                      <span className="text-[10px] text-muted-foreground ml-1">/ {row.dailyLimit * 7}</span>
                    )}
                  </td>
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
        <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
          <strong>Why a new sender shows few sends:</strong> existing contacts stay sticky-locked
          to whichever sender first emailed them. Only fresh contacts auto-rotate to new senders
          (subject to per-sender daily caps).
        </p>
      </CardContent>
    </Card>
  );
}
