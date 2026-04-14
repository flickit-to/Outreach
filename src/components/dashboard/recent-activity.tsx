import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";
import {
  Mail,
  Eye,
  MousePointerClick,
  AlertTriangle,
  CheckCircle,
  MessageSquare,
} from "lucide-react";

interface ActivityItem {
  id: string;
  type: string;
  contact_email: string;
  contact_name: string | null;
  campaign_name: string;
  created_at: string;
}

const EVENT_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  sent: { icon: Mail, label: "Sent to", color: "text-blue-600" },
  delivered: { icon: CheckCircle, label: "Delivered to", color: "text-indigo-600" },
  opened: { icon: Eye, label: "Opened by", color: "text-yellow-600" },
  clicked: { icon: MousePointerClick, label: "Clicked by", color: "text-green-600" },
  bounced: { icon: AlertTriangle, label: "Bounced for", color: "text-red-600" },
  replied: { icon: MessageSquare, label: "Replied by", color: "text-teal-600" },
};

export function RecentActivity({ activities }: { activities: ActivityItem[] }) {
  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No activity yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {activities.map((activity) => {
            const config = EVENT_CONFIG[activity.type] || EVENT_CONFIG.sent;
            const Icon = config.icon;

            return (
              <div key={activity.id} className="flex items-start gap-3">
                <div className={`mt-0.5 ${config.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{config.label}</span>{" "}
                    {activity.contact_name || activity.contact_email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {activity.campaign_name} &middot;{" "}
                    {formatRelativeTime(activity.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
