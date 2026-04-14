"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tag, TagColor } from "@/lib/types";
import { TAG_COLORS, TAG_COLOR_CLASSES } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, X, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function TagSelector({
  allTags: initialAllTags,
  selectedTagNames,
  onChange,
  userId,
}: {
  allTags: Tag[];
  selectedTagNames: string[];
  onChange: (tagNames: string[]) => void;
  userId: string;
}) {
  const [allTags, setAllTags] = useState<Tag[]>(initialAllTags);
  const [newTagName, setNewTagName] = useState("");
  const { toast } = useToast();

  const selectedTags = allTags.filter((t) => selectedTagNames.includes(t.name));

  function toggleTag(name: string) {
    if (selectedTagNames.includes(name)) {
      onChange(selectedTagNames.filter((n) => n !== name));
    } else {
      onChange([...selectedTagNames, name]);
    }
  }

  function removeTag(name: string) {
    onChange(selectedTagNames.filter((n) => n !== name));
  }

  async function createAndAddTag() {
    if (!newTagName.trim()) return;
    const name = newTagName.trim();

    // Check if already exists
    const existing = allTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      toggleTag(existing.name);
      setNewTagName("");
      return;
    }

    // Pick a random color
    const color: TagColor = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tags")
      .insert({ user_id: userId, name, color })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setAllTags([...allTags, data as Tag]);
    onChange([...selectedTagNames, name]);
    setNewTagName("");
  }

  return (
    <div className="space-y-2">
      {/* Selected tags */}
      <div className="flex flex-wrap gap-1 min-h-[32px] p-2 border rounded-md">
        {selectedTags.length === 0 && (
          <span className="text-sm text-muted-foreground self-center">No tags</span>
        )}
        {selectedTags.map((tag) => (
          <span
            key={tag.id}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${TAG_COLOR_CLASSES[tag.color]}`}
          >
            {tag.name}
            <button
              type="button"
              onClick={() => removeTag(tag.name)}
              className="hover:opacity-70"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {/* Tag picker dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-muted-foreground hover:bg-muted border border-dashed border-muted-foreground/30"
            >
              <Plus className="h-3 w-3" />
              Add tag
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {/* Create new tag inline */}
            <div className="p-2 border-b">
              <input
                type="text"
                placeholder="Type to create tag..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    createAndAddTag();
                  }
                }}
                className="w-full text-sm px-2 py-1 border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {newTagName.trim() && !allTags.some((t) => t.name.toLowerCase() === newTagName.trim().toLowerCase()) && (
                <button
                  type="button"
                  onClick={createAndAddTag}
                  className="w-full mt-1 text-left text-xs px-2 py-1 rounded hover:bg-muted"
                >
                  + Create &quot;{newTagName.trim()}&quot;
                </button>
              )}
            </div>

            {allTags.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground text-center">
                No tags yet. Type above to create one, or go to Settings → Tags.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                {allTags
                  .filter((t) =>
                    !newTagName.trim() ||
                    t.name.toLowerCase().includes(newTagName.trim().toLowerCase())
                  )
                  .map((tag) => {
                    const isSelected = selectedTagNames.includes(tag.name);
                    return (
                      <DropdownMenuItem
                        key={tag.id}
                        onClick={(e) => {
                          e.preventDefault();
                          toggleTag(tag.name);
                        }}
                        className="flex items-center gap-2"
                      >
                        <div className="w-4">
                          {isSelected && <Check className="h-3 w-3 text-primary" />}
                        </div>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${TAG_COLOR_CLASSES[tag.color]}`}
                        >
                          {tag.name}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
