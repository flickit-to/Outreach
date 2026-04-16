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
import { Label } from "@/components/ui/label";
import { GitBranch } from "lucide-react";

type Trigger = "opened" | "clicked" | "opened_or_clicked";

export function CreateFollowupDialog({
  parentCampaignId,
  parentName,
  openedCount,
  clickedCount,
  openedOrClickedCount,
}: {
  parentCampaignId: string;
  parentName: string;
  openedCount: number;
  clickedCount: number;
  openedOrClickedCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<Trigger>("opened_or_clicked");
  const router = useRouter();

  const counts = {
    opened: openedCount,
    clicked: clickedCount,
    opened_or_clicked: openedOrClickedCount,
  };

  function handleCreate() {
    // Navigate to new campaign form with parent info pre-set
    const params = new URLSearchParams({
      parent: parentCampaignId,
      trigger,
      name: `${parentName} - Follow-up`,
    });
    router.push(`/campaigns/new?${params.toString()}`);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <GitBranch className="h-4 w-4 mr-2" />
        Create Follow-up
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Follow-up Campaign</DialogTitle>
            <DialogDescription>
              Send a follow-up email to people who engaged with this campaign.
              Recipients are auto-resolved at send time (live).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Label>Send to people who:</Label>
            <div className="space-y-2">
              <label className="flex items-center justify-between p-3 rounded-md border cursor-pointer hover:bg-muted">
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    checked={trigger === "opened"}
                    onChange={() => setTrigger("opened")}
                    className="h-4 w-4"
                  />
                  <div>
                    <p className="text-sm font-medium">Opened the email</p>
                    <p className="text-xs text-muted-foreground">Includes those who clicked</p>
                  </div>
                </div>
                <span className="text-sm font-medium">{counts.opened} contacts</span>
              </label>

              <label className="flex items-center justify-between p-3 rounded-md border cursor-pointer hover:bg-muted">
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    checked={trigger === "clicked"}
                    onChange={() => setTrigger("clicked")}
                    className="h-4 w-4"
                  />
                  <div>
                    <p className="text-sm font-medium">Clicked a link</p>
                    <p className="text-xs text-muted-foreground">Most engaged subset</p>
                  </div>
                </div>
                <span className="text-sm font-medium">{counts.clicked} contacts</span>
              </label>

              <label className="flex items-center justify-between p-3 rounded-md border cursor-pointer hover:bg-muted">
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    checked={trigger === "opened_or_clicked"}
                    onChange={() => setTrigger("opened_or_clicked")}
                    className="h-4 w-4"
                  />
                  <div>
                    <p className="text-sm font-medium">Opened OR clicked</p>
                    <p className="text-xs text-muted-foreground">Anyone who engaged at all</p>
                  </div>
                </div>
                <span className="text-sm font-medium">{counts.opened_or_clicked} contacts</span>
              </label>
            </div>

            <p className="text-xs text-muted-foreground italic">
              Contacts marked as Replied, Meeting Booked, or Closed will automatically be excluded.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={counts[trigger] === 0}>
              Create Follow-up ({counts[trigger]} contacts)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
