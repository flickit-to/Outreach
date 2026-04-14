import type { ContactActivity } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import {
  Mail,
  Eye,
  MousePointerClick,
  AlertTriangle,
  CheckCircle,
  MessageSquare,
} from "lucide-react";

const EVENT_CONFIG = {
  sent: { icon: Mail, label: "Email sent", color: "text-blue-600" },
  delivered: { icon: CheckCircle, label: "Delivered", color: "text-indigo-600" },
  opened: { icon: Eye, label: "Opened", color: "text-yellow-600" },
  clicked: { icon: MousePointerClick, label: "Clicked", color: "text-green-600" },
  bounced: { icon: AlertTriangle, label: "Bounced", color: "text-red-600" },
  replied: { icon: MessageSquare, label: "Replied", color: "text-teal-600" },
};

export function ActivityTimeline({
  activities,
}: {
  activities: ContactActivity[];
}) {
  if (activities.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-4">
        No activity yet for this contact.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {activities.map((activity) => {
        const config = EVENT_CONFIG[activity.event.type];
        const Icon = config.icon;
        const metadata = activity.event.metadata as Record<string, string>;

        return (
          <div key={activity.event.id} className="flex gap-3 items-start">
            <div className={`mt-0.5 ${config.color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {config.label}
                {metadata?.url && (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    — {metadata.url}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Campaign: {activity.campaign.name} &middot;{" "}
                {formatDateTime(activity.event.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
