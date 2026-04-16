import { Card, CardContent } from "@/components/ui/card";
import { Users, Mail, Eye, MousePointerClick, AlertTriangle, TrendingUp } from "lucide-react";

interface DashboardStatsProps {
  totalContacts: number;
  totalSent: number;
  totalDelivered: number;
  totalClicked: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  activeCampaigns: number;
}

export function StatsCards({
  totalContacts,
  totalSent,
  totalDelivered,
  totalClicked,
  openRate,
  clickRate,
  bounceRate,
  activeCampaigns,
}: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <Card>
        <CardContent className="pt-6">
          <Users className="h-4 w-4 text-blue-600 mb-1" />
          <div className="text-2xl font-bold">{totalContacts}</div>
          <p className="text-xs text-muted-foreground">Total Contacts</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Mail className="h-4 w-4 text-indigo-600 mb-1" />
          <div className="text-2xl font-bold">{totalSent}</div>
          <p className="text-xs text-muted-foreground">Emails Sent</p>
          {totalDelivered > 0 && totalDelivered < totalSent && (
            <p className="text-[10px] text-muted-foreground">{totalDelivered} confirmed delivered</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Eye className="h-4 w-4 text-yellow-600 mb-1" />
          <div className="text-2xl font-bold">{openRate}%</div>
          <p className="text-xs text-muted-foreground">Open Rate</p>
          {openRate > 80 && (
            <p className="text-[10px] text-orange-500">*Gmail inflates this</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <MousePointerClick className="h-4 w-4 text-green-600 mb-1" />
          <div className="text-2xl font-bold">{clickRate}%</div>
          <p className="text-xs text-muted-foreground">Click Rate</p>
          <p className="text-[10px] text-muted-foreground">{totalClicked} clicks</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <AlertTriangle className="h-4 w-4 text-red-600 mb-1" />
          <div className="text-2xl font-bold">{bounceRate}%</div>
          <p className="text-xs text-muted-foreground">Bounce Rate</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <TrendingUp className="h-4 w-4 text-purple-600 mb-1" />
          <div className="text-2xl font-bold">{activeCampaigns}</div>
          <p className="text-xs text-muted-foreground">Active Campaigns</p>
        </CardContent>
      </Card>
    </div>
  );
}
