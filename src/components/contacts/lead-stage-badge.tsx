"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LEAD_STAGES } from "@/lib/constants";
import { getStatusColor } from "@/lib/utils";
import type { LeadStage } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown } from "lucide-react";
import { setContactLeadStage } from "@/app/(dashboard)/contacts/actions";

// Mirror of the server-side list in src/app/(dashboard)/contacts/actions.ts.
// Only "not_a_fit" cascades to the whole email domain.
const CASCADE_STAGES: LeadStage[] = ["not_a_fit"];

export function LeadStageBadge({
  contactId,
  stage,
}: {
  contactId: string;
  stage: LeadStage;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const currentStage = LEAD_STAGES.find((s) => s.value === stage);

  async function updateStage(newStage: LeadStage) {
    // Confirm before cascading — these stages also mark every contact at the
    // same email domain as Not a fit and exit them from any active sequence.
    if (CASCADE_STAGES.includes(newStage)) {
      const ok = window.confirm(
        `Marking as "${LEAD_STAGES.find((s) => s.value === newStage)?.label}" will also mark every contact at the SAME email domain as "Not a fit" and remove them from any active sequence.\n\nContinue?`,
      );
      if (!ok) return;
    }

    const r = await setContactLeadStage(contactId, newStage);
    if (!r.ok) {
      toast({ title: "Error", description: r.error, variant: "destructive" });
      return;
    }

    const stageLabel = LEAD_STAGES.find((s) => s.value === newStage)?.label;
    if (r.cascadeCount > 0) {
      toast({
        title: `Marked ${stageLabel}`,
        description: `Also exited ${r.cascadeCount} contact(s) at the same domain as Not a fit.`,
      });
    } else {
      toast({ title: "Stage updated", description: `Changed to ${stageLabel}` });
    }
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 focus:outline-none">
          <Badge variant="secondary" className={getStatusColor(stage)}>
            {currentStage?.label || stage}
          </Badge>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {LEAD_STAGES.map((s) => (
          <DropdownMenuItem
            key={s.value}
            onClick={() => updateStage(s.value as LeadStage)}
            className={stage === s.value ? "font-bold" : ""}
          >
            <Badge variant="secondary" className={`${s.color} mr-2`}>
              {s.label}
            </Badge>
            {s.action && (
              <span className="text-xs text-muted-foreground">{s.action}</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
