import { Card, CardContent } from "@/components/ui/card";
import { Users, Mail, Eye, MousePointerClick, AlertTriangle, TrendingUp } from "lucide-react";

interface DashboardStatsProps {
  totalContacts: number;
  totalSent: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  activeCampaigns: number;
}

export function StatsCards({
  totalContacts,
  totalSent,
  openRate,
  clickRate,
  bounceRate,
  activeCampaigns,
}: DashboardStatsProps) {
  const stats = [
    { label: "Total Contacts", value: totalContacts, icon: Users, color: "text-blue-600" },
    { label: "Emails Sent", value: totalSent, icon: Mail, color: "text-indigo-600" },
    { label: "Open Rate", value: `${openRate}%`, icon: Eye, color: "text-yellow-600" },
    { label: "Click Rate", value: `${clickRate}%`, icon: MousePointerClick, color: "text-green-600" },
    { label: "Bounce Rate", value: `${bounceRate}%`, icon: AlertTriangle, color: "text-red-600" },
    { label: "Active Campaigns", value: activeCampaigns, icon: TrendingUp, color: "text-purple-600" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
