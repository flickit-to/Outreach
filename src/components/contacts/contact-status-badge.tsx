import { Badge } from "@/components/ui/badge";
import { getStatusColor } from "@/lib/utils";
import type { ContactStatus } from "@/lib/types";

const STATUS_LABELS: Record<ContactStatus, string> = {
  not_contacted: "Not Contacted",
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  clicked: "Engaged",
  bounced: "Bounced",
};

export function ContactStatusBadge({ status }: { status: ContactStatus }) {
  return (
    <Badge variant="secondary" className={getStatusColor(status)}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
