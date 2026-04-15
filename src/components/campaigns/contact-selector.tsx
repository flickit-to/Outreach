"use client";

import { useState } from "react";
import type { Contact } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Check } from "lucide-react";

export function ContactSelector({
  contacts,
  selected,
  onChange,
}: {
  contacts: Contact[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = contacts.filter(
    (c) =>
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (c.first_name && c.first_name.toLowerCase().includes(search.toLowerCase())) ||
      (c.last_name && c.last_name.toLowerCase().includes(search.toLowerCase()))
  );

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(contacts.map((c) => c.id))}
        >
          Select All
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([])}
        >
          Clear
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {selected.length} of {contacts.length} selected
      </p>

      <div className="border rounded-md max-h-64 overflow-y-auto">
        {filtered.map((contact) => {
          const isSelected = selected.includes(contact.id);
          return (
            <button
              key={contact.id}
              type="button"
              onClick={() => toggle(contact.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted transition-colors ${
                isSelected ? "bg-primary/5" : ""
              }`}
            >
              <div
                className={`h-4 w-4 rounded border flex items-center justify-center ${
                  isSelected
                    ? "bg-primary border-primary"
                    : "border-muted-foreground/30"
                }`}
              >
                {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate privacy-blur">
                  {[contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email}
                </p>
                {contact.first_name && (
                  <p className="text-xs text-muted-foreground privacy-blur">{contact.email}</p>
                )}
              </div>
              {contact.company && (
                <Badge variant="outline" className="text-xs privacy-blur">
                  {contact.company}
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
