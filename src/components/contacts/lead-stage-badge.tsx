"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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

  async function updateStage(newStage: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("contacts")
      .update({ lead_stage: newStage })
      .eq("id", contactId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Stage updated", description: `Changed to ${LEAD_STAGES.find((s) => s.value === newStage)?.label}` });
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
            onClick={() => updateStage(s.value)}
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
