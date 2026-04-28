"use client";

import { useState } from "react";
import Link from "next/link";
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
import { useToast } from "@/hooks/use-toast";
import { Play, Pause, Zap, Pencil, Trash2 } from "lucide-react";
import {
  activateSequence,
  deleteSequence,
  pauseSequence,
  runEngineNow,
} from "@/app/(dashboard)/sequences/actions";

export function SequenceActionBar({
  sequenceId,
  sequenceName,
  status,
  hasList,
  hasSteps,
}: {
  sequenceId: string;
  sequenceName: string;
  status: string;
  hasList: boolean;
  hasSteps: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const wrap = async (key: string, fn: () => Promise<any>, label: string) => {
    setBusy(key);
    try {
      const r = await fn();
      if (r?.ok === false) {
        toast({ title: `${label} failed`, description: r.error, variant: "destructive" });
      } else {
        const detail =
          r?.enrolled !== undefined
            ? `${r.enrolled} of ${r.total_contacts} enrolled`
            : r?.results
              ? Object.entries(r.results)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")
              : undefined;
        toast({ title: `${label} ✓`, description: detail });
        router.refresh();
      }
    } catch (e: any) {
      toast({ title: `${label} threw`, description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const canActivate =
    (status === "draft" || status === "paused") && hasList && hasSteps;
  const canEditOrDelete = status !== "active";
  const editDisabledHint = !canEditOrDelete
    ? "Pause the sequence before editing."
    : undefined;
  const deleteDisabledHint = !canEditOrDelete
    ? "Pause the sequence before deleting."
    : undefined;

  return (
    <>
      <div className="flex items-center gap-2">
        {canActivate && (
          <Button
            size="sm"
            onClick={() => wrap("activate", () => activateSequence(sequenceId), "Activate")}
            disabled={busy !== null}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {status === "paused" ? "Resume" : "Activate"}
          </Button>
        )}
        {status === "active" && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => wrap("pause", () => pauseSequence(sequenceId), "Pause")}
              disabled={busy !== null}
            >
              <Pause className="h-3.5 w-3.5 mr-1.5" />
              Pause
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => wrap("run", () => runEngineNow(sequenceId), "Engine tick")}
              disabled={busy !== null}
              title="Manually run the engine for due enrollments — for testing without waiting on cron."
            >
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Run engine now
            </Button>
          </>
        )}
        {!canActivate && status === "draft" && (
          <span className="text-xs text-muted-foreground">
            {!hasList && "Pick a list before activating."}
            {hasList && !hasSteps && "Add at least one step."}
          </span>
        )}

        {canEditOrDelete ? (
          <Link href={`/sequences/${sequenceId}/edit`}>
            <Button size="sm" variant="outline">
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
          </Link>
        ) : (
          <Button size="sm" variant="outline" disabled title={editDisabledHint}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
          disabled={busy !== null || !canEditOrDelete}
          title={deleteDisabledHint}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Delete
        </Button>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this sequence?</DialogTitle>
            <DialogDescription>
              <span className="block mb-2">
                <strong>{sequenceName}</strong> will be permanently removed.
              </span>
              <span className="block">
                Steps and enrollment progress are deleted. Sent emails stay in your history (the link to this sequence is dropped).
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(false)}
              disabled={busy === "delete"}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-destructive hover:bg-destructive/90"
              onClick={async () => {
                setBusy("delete");
                const r = await deleteSequence(sequenceId);
                // deleteSequence redirects on success; if we get here, it failed
                if (r && (r as { ok?: boolean }).ok === false) {
                  toast({
                    title: "Delete failed",
                    description: (r as { error?: string }).error,
                    variant: "destructive",
                  });
                  setBusy(null);
                  setConfirmDelete(false);
                }
              }}
              disabled={busy === "delete"}
            >
              {busy === "delete" ? "Deleting…" : "Delete sequence"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
