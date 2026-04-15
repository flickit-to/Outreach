import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import {
  AlertCircle,
  Eye,
  MousePointerClick,
  AlertTriangle,
  Calendar,
  ArrowRight,
} from "lucide-react";

interface DigestContact {
  contactId: string;
  name: string | null;
  email: string;
  count?: number;
  daysSinceSend?: number;
}

interface DigestCampaign {
  id: string;
  name: string;
  scheduledAt: string;
}

interface DailyDigestProps {
  openedToday: DigestContact[];
  clickedToday: DigestContact[];
  bouncedToday: DigestContact[];
  needFollowUp: DigestContact[];
  upcomingCampaigns: DigestCampaign[];
}

export function DailyDigest({
  openedToday,
  clickedToday,
  bouncedToday,
  needFollowUp,
  upcomingCampaigns,
}: DailyDigestProps) {
  const hasActions = needFollowUp.length > 0 || openedToday.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s Digest</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Action Items */}
        {hasActions && (
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              Action Items
            </p>
            <div className="space-y-1">
              {needFollowUp.length > 0 && (
                <div className="flex items-center justify-between p-2 rounded-md bg-orange-50 text-orange-800 text-sm">
                  <span>{needFollowUp.length} contacts need follow-up</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
              {openedToday.length > 0 && (
                <div className="flex items-center justify-between p-2 rounded-md bg-yellow-50 text-yellow-800 text-sm">
                  <span>{openedToday.length} contacts opened today — engage now</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
              {bouncedToday.length > 0 && (
                <div className="flex items-center justify-between p-2 rounded-md bg-red-50 text-red-800 text-sm">
                  <span>{bouncedToday.length} bounces today — review</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </div>
          </div>
        )}

        {!hasActions && openedToday.length === 0 && clickedToday.length === 0 && bouncedToday.length === 0 && upcomingCampaigns.length === 0 && (
          <p className="text-sm text-muted-foreground">No activity today yet.</p>
        )}

        {/* Today's Opens */}
        {openedToday.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Eye className="h-4 w-4 text-yellow-600" />
              Opened Today ({openedToday.length})
            </p>
            <div className="space-y-1">
              {openedToday.slice(0, 5).map((c) => (
                <Link
                  key={c.contactId}
                  href={`/contacts/${c.contactId}`}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-muted text-sm"
                >
                  <span className="privacy-blur">{c.name || c.email}</span>
                  {c.count && c.count > 1 && (
                    <Badge variant="secondary" className="text-xs">{c.count}x</Badge>
                  )}
                </Link>
              ))}
              {openedToday.length > 5 && (
                <p className="text-xs text-muted-foreground pl-2">
                  +{openedToday.length - 5} more
                </p>
              )}
            </div>
          </div>
        )}

        {/* Today's Clicks */}
        {clickedToday.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <MousePointerClick className="h-4 w-4 text-green-600" />
              Clicked Today ({clickedToday.length})
            </p>
            <div className="space-y-1">
              {clickedToday.slice(0, 5).map((c) => (
                <Link
                  key={c.contactId}
                  href={`/contacts/${c.contactId}`}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-muted text-sm"
                >
                  <span className="privacy-blur">{c.name || c.email}</span>
                  {c.count && c.count > 1 && (
                    <Badge variant="secondary" className="text-xs">{c.count}x</Badge>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Follow-ups Needed */}
        {needFollowUp.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              Need Follow-up ({needFollowUp.length})
            </p>
            <div className="space-y-1">
              {needFollowUp.slice(0, 5).map((c) => (
                <Link
                  key={c.contactId}
                  href={`/contacts/${c.contactId}`}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-muted text-sm"
                >
                  <span className="privacy-blur">{c.name || c.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.daysSinceSend}d ago
                  </span>
                </Link>
              ))}
              {needFollowUp.length > 5 && (
                <p className="text-xs text-muted-foreground pl-2">
                  +{needFollowUp.length - 5} more
                </p>
              )}
            </div>
          </div>
        )}

        {/* Upcoming Campaigns */}
        {upcomingCampaigns.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              Upcoming Campaigns
            </p>
            <div className="space-y-1">
              {upcomingCampaigns.map((c) => (
                <Link
                  key={c.id}
                  href={`/campaigns/${c.id}`}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-muted text-sm"
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(c.scheduledAt)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
