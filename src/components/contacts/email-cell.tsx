"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Email cell with copy-on-hover icon. Click the icon → copy to clipboard,
 * brief check icon flash, toast.
 */
export function EmailCell({
  email,
  className,
}: {
  email: string;
  className?: string;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    let ok = false;
    try {
      await navigator.clipboard.writeText(email);
      ok = true;
    } catch {
      // Fallback: hidden textarea + execCommand (works in older / restricted contexts)
      try {
        const ta = document.createElement("textarea");
        ta.value = email;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      toast({ title: "Email copied", description: email });
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast({
        title: "Copy failed",
        description: "Browser blocked clipboard access.",
        variant: "destructive",
      });
    }
  };

  return (
    <span
      className={`group/email relative inline-flex items-center gap-1 text-sm text-muted-foreground privacy-blur ${className ?? ""}`}
    >
      <span className="truncate">{email}</span>
      <button
        type="button"
        onClick={handleCopy}
        title="Copy email"
        aria-label="Copy email"
        className="ml-0.5 p-0.5 rounded hover:bg-muted opacity-0 group-hover/email:opacity-100 transition-opacity"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-600" />
        ) : (
          <Copy className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
    </span>
  );
}
