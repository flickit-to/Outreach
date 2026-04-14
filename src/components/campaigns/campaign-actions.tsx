"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pause, Play, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function CampaignActions({
  campaignId,
  status,
  campaignName,
  variant = "dropdown",
}: {
  campaignId: string;
  status: string;
  campaignName: string;
  variant?: "dropdown" | "buttons";
}) {
  const [loading, setLoading] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const canPause = ["scheduled", "sending"].includes(status);
  const canResume = status === "cancelled";
  async function handleAction(action: "pause" | "resume" | "delete") {
    if (action === "delete") {
      setShowDelete(true);
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/campaigns/${campaignId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    const result = await res.json();
    setLoading(false);

    if (!res.ok) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
      return;
    }

    toast({
      title: action === "pause" ? "Campaign paused" : "Campaign resumed",
      description: action === "resume" ? "Campaign will send on the next cycle." : undefined,
    });
    router.refresh();
  }

  async function handleDelete() {
    setLoading(true);
    const res = await fetch(`/api/campaigns/${campaignId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete" }),
    });

    setLoading(false);
    setShowDelete(false);

    if (!res.ok) {
      const result = await res.json();
      toast({ title: "Error", description: result.error, variant: "destructive" });
      return;
    }

    toast({ title: "Campaign deleted" });
    router.push("/campaigns");
    router.refresh();
  }

  if (variant === "buttons") {
    return (
      <>
        <div className="flex gap-2">
          {canPause && (
            <Button variant="outline" size="sm" onClick={() => handleAction("pause")} disabled={loading}>
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}
          {canResume && (
            <Button variant="outline" size="sm" onClick={() => handleAction("resume")} disabled={loading}>
              <Play className="h-4 w-4 mr-2" />
              Resume
            </Button>
          )}
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => setShowDelete(true)} disabled={loading}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>

        <Dialog open={showDelete} onOpenChange={setShowDelete}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete &quot;{campaignName}&quot;?</DialogTitle>
              <DialogDescription>
                This will permanently delete the campaign, all send records, and tracking data. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={loading}>
                {loading ? "Deleting..." : "Delete Campaign"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Dropdown variant for the list view
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canPause && (
            <DropdownMenuItem onClick={() => handleAction("pause")}>
              <Pause className="h-4 w-4 mr-2" />
              Pause Campaign
            </DropdownMenuItem>
          )}
          {canResume && (
            <DropdownMenuItem onClick={() => handleAction("resume")}>
              <Play className="h-4 w-4 mr-2" />
              Resume Campaign
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowDelete(true)} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Campaign
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &quot;{campaignName}&quot;?</DialogTitle>
            <DialogDescription>
              This will permanently delete the campaign and all tracking data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? "Deleting..." : "Delete Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
