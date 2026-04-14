import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";

export interface CompanyRow {
  company: string;
  contacts: number;
  sent: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
}

export function CompanyAnalyticsCard({
  companiesTargeted,
  rows,
}: {
  companiesTargeted: number;
  rows: CompanyRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Company Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 mb-4">
          <Building2 className="h-6 w-6 text-primary" />
          <div>
            <p className="text-lg font-bold">{companiesTargeted}</p>
            <p className="text-xs text-muted-foreground">Companies Targeted</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No company data yet. Add companies to your contacts to see analytics.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 px-2 text-left text-xs font-medium text-muted-foreground">Company</th>
                  <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">Contacts</th>
                  <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">Sent</th>
                  <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">Open Rate</th>
                  <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">Click Rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.company} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 px-2 font-medium truncate max-w-xs">{row.company}</td>
                    <td className="py-2 px-2 text-right">{row.contacts}</td>
                    <td className="py-2 px-2 text-right">{row.sent}</td>
                    <td className="py-2 px-2 text-right">{row.openRate}%</td>
                    <td className="py-2 px-2 text-right">{row.clickRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
