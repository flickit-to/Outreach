"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Tag, TagColor } from "@/lib/types";
import { TAG_COLORS, TAG_COLOR_CLASSES } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Tags as TagsIcon, ChevronDown } from "lucide-react";

function TagBadge({ tag }: { tag: Tag }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${TAG_COLOR_CLASSES[tag.color]}`}
    >
      {tag.name}
    </span>
  );
}

function ColorSwatch({ color, active }: { color: TagColor; active: boolean }) {
  return (
    <div
      className={`h-5 w-5 rounded border-2 ${TAG_COLOR_CLASSES[color].split(" ").slice(0, 1).join(" ")} ${active ? "ring-2 ring-offset-1 ring-primary" : ""}`}
      title={color}
    />
  );
}

export function TagsManager({
  tags: initialTags,
  userId,
}: {
  tags: Tag[];
  userId: string;
}) {
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState<TagColor>("gray");
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function addTag() {
    if (!newTagName.trim()) return;
    setAdding(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tags")
      .insert({ user_id: userId, name: newTagName.trim(), color: newTagColor })
      .select()
      .single();
    setAdding(false);

    if (error) {
      toast({
        title: "Error",
        description: error.message.includes("unique") ? "Tag already exists" : error.message,
        variant: "destructive",
      });
      return;
    }

    setTags([...tags, data as Tag]);
    setNewTagName("");
    setNewTagColor("gray");
    toast({ title: "Tag added" });
    router.refresh();
  }

  async function updateTagColor(tagId: string, color: TagColor) {
    const supabase = createClient();
    const { error } = await supabase.from("tags").update({ color }).eq("id", tagId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setTags(tags.map((t) => (t.id === tagId ? { ...t, color } : t)));
    toast({ title: "Color updated" });
    router.refresh();
  }

  async function deleteTag(tagId: string) {
    const supabase = createClient();
    const { error } = await supabase.from("tags").delete().eq("id", tagId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setTags(tags.filter((t) => t.id !== tagId));
    toast({ title: "Tag deleted" });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TagsIcon className="h-5 w-5" />
          Tags
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Create tags with colors to categorize your contacts.
        </p>

        {/* Existing tags */}
        {tags.length > 0 && (
          <div className="space-y-2">
            {tags.map((tag) => (
              <div key={tag.id} className="flex items-center justify-between p-2 rounded-md border">
                <TagBadge tag={tag} />
                <div className="flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-muted">
                        <ColorSwatch color={tag.color} active={false} />
                        <span className="capitalize">{tag.color}</span>
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {TAG_COLORS.map((c) => (
                        <DropdownMenuItem key={c} onClick={() => updateTagColor(tag.id, c)}>
                          <ColorSwatch color={c} active={tag.color === c} />
                          <span className="ml-2 capitalize">{c}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => deleteTag(tag.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Separator />

        {/* Add new tag */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Add Tag</p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1">
              <Label htmlFor="tag-name" className="text-xs">Name</Label>
              <Input
                id="tag-name"
                placeholder="e.g. lead, customer, vip"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTag()}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Color</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 h-10 px-3 rounded-md border border-input bg-background hover:bg-muted">
                    <ColorSwatch color={newTagColor} active={false} />
                    <span className="text-sm capitalize">{newTagColor}</span>
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {TAG_COLORS.map((c) => (
                    <DropdownMenuItem key={c} onClick={() => setNewTagColor(c)}>
                      <ColorSwatch color={c} active={newTagColor === c} />
                      <span className="ml-2 capitalize">{c}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addTag}
            disabled={adding || !newTagName.trim()}
          >
            <Plus className="h-4 w-4 mr-2" />
            {adding ? "Adding..." : "Add Tag"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
