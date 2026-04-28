import { Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function BroadcastsPage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h1 className="text-2xl font-bold">Broadcasts</h1>
        <Badge variant="outline" className="text-[10px]">v2 preview</Badge>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        One-off newsletters and announcements to a list segment.
      </p>

      <div className="border rounded-md p-12 text-center">
        <Megaphone className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
        <h3 className="font-medium mb-1">Coming in Phase 2</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          A Broadcast is a single email sent to everyone matching a list/segment — no follow-ups, no per-contact cadence. Newsletters live here.
        </p>
      </div>
    </div>
  );
}
