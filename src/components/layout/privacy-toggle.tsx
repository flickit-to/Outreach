"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

export function PrivacyToggle() {
  const [enabled, setEnabled] = useState(false);

  // Persist in localStorage
  useEffect(() => {
    const saved = localStorage.getItem("privacy-mode") === "1";
    setEnabled(saved);
    if (saved) document.documentElement.classList.add("privacy-mode");
  }, []);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    if (next) {
      document.documentElement.classList.add("privacy-mode");
      localStorage.setItem("privacy-mode", "1");
    } else {
      document.documentElement.classList.remove("privacy-mode");
      localStorage.removeItem("privacy-mode");
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      title={enabled ? "Disable privacy mode" : "Enable privacy mode (blur sensitive data)"}
    >
      {enabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </Button>
  );
}
