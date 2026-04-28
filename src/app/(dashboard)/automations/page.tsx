import { Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AutomationsPage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h1 className="text-2xl font-bold">Automations</h1>
        <Badge variant="outline" className="text-[10px]">v2 preview</Badge>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        "When X happens, do Y" — enrol contacts, change stages, fire follow-ups.
      </p>

      <div className="border rounded-md p-12 text-center">
        <Zap className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
        <h3 className="font-medium mb-1">Coming in Phase 3</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Each automation is one rule: a trigger (list joined, stage changed, email opened, didn't open in N days) and an action (enrol in sequence, set stage, send broadcast). Stack rules to build whole funnels.
        </p>
      </div>
    </div>
  );
}
