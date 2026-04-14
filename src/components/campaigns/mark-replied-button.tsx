"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function MarkRepliedButton({
  sendId,
  currentStatus,
}: {
  sendId: string;
  currentStatus: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  if (["replied", "bounced", "failed", "pending"].includes(currentStatus)) {
    return null;
  }

  async function handleClick() {
    setLoading(true);
    const res = await fetch(`/api/sends/${sendId}/reply`, { method: "POST" });

    if (!res.ok) {
      toast({ title: "Error", description: "Failed to mark as replied", variant: "destructive" });
      setLoading(false);
      return;
    }

    toast({ title: "Marked as replied" });
    router.refresh();
    setLoading(false);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-teal-600"
      onClick={handleClick}
      disabled={loading}
      title="Mark as replied"
    >
      <MessageSquare className="h-4 w-4" />
    </Button>
  );
}
