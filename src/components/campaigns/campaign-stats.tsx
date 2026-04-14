import { Card, CardContent } from "@/components/ui/card";
import { Mail, CheckCircle, Eye, MousePointerClick, AlertTriangle, Users } from "lucide-react";

interface StatsProps {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
}

export function CampaignStats({ total, sent, delivered, opened, clicked, bounced }: StatsProps) {
  const stats = [
    { label: "Recipients", value: total, icon: Users, color: "text-gray-600" },
    { label: "Sent", value: sent, icon: Mail, color: "text-blue-600" },
    { label: "Delivered", value: delivered, icon: CheckCircle, color: "text-indigo-600" },
    { label: "Opened", value: opened, icon: Eye, color: "text-yellow-600", pct: delivered > 0 ? Math.round((opened / delivered) * 100) : 0 },
    { label: "Clicked", value: clicked, icon: MousePointerClick, color: "text-green-600", pct: delivered > 0 ? Math.round((clicked / delivered) * 100) : 0 },
    { label: "Bounced", value: bounced, icon: AlertTriangle, color: "text-red-600", pct: sent > 0 ? Math.round((bounced / sent) * 100) : 0 },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
              <span className="text-sm text-muted-foreground">{stat.label}</span>
            </div>
            <div className="text-2xl font-bold">
              {stat.value}
              {"pct" in stat && stat.pct !== undefined && (
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  ({stat.pct}%)
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
