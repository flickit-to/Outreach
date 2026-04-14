"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Contact, Tag } from "@/lib/types";
import { TAG_COLOR_CLASSES } from "@/lib/types";
import { ContactStatusBadge } from "./contact-status-badge";
import { LeadStageBadge } from "./lead-stage-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Search,
  Trash2,
  Eye,
  Check,
  Type,
  AtSign,
  Building2,
  Briefcase,
  Target,
  Mail,
  Tags,
  ArrowUp,
  ArrowDown,
  Filter,
  ArrowLeftToLine,
  ArrowRightToLine,
  X,
  ListPlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LEAD_STAGES } from "@/lib/constants";

// Column definition
interface ColumnDef {
  key: string;
  label: string;
  icon: any;
  sortable: boolean;
  filterable: boolean;
}

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: "first_name", label: "First Name", icon: Type, sortable: true, filterable: false },
  { key: "last_name", label: "Last Name", icon: Type, sortable: true, filterable: false },
  { key: "email", label: "Email", icon: AtSign, sortable: true, filterable: false },
  { key: "company", label: "Company", icon: Building2, sortable: true, filterable: true },
  { key: "role", label: "Role", icon: Briefcase, sortable: true, filterable: true },
  { key: "lead_stage", label: "Lead Stage", icon: Target, sortable: true, filterable: true },
  { key: "status", label: "Email Status", icon: Mail, sortable: true, filterable: true },
  { key: "tags", label: "Tags", icon: Tags, sortable: false, filterable: false },
];

type SortDir = "asc" | "desc" | null;

function getContactValue(contact: Contact, key: string): string {
  switch (key) {
    case "first_name": return contact.first_name || "";
    case "last_name": return contact.last_name || "";
    case "email": return contact.email;
    case "company": return contact.company || "";
    case "role": return contact.role || "";
    case "lead_stage": return contact.lead_stage;
    case "status": return contact.status;
    case "tags": return contact.tags.join(", ");
    default: return "";
  }
}

function getUniqueValues(contacts: Contact[], key: string): string[] {
  const values = new Set<string>();
  for (const c of contacts) {
    const val = getContactValue(c, key);
    if (val) values.add(val);
  }
  return Array.from(values).sort();
}

export function ContactTable({ contacts, allTags = [] }: { contacts: Contact[]; allTags?: Tag[] }) {
  const tagColorByName = new Map(allTags.map((t) => [t.name, t.color]));
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showSaveList, setShowSaveList] = useState(false);
  const [listName, setListName] = useState("");

  // Sort state
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // Column filter state: { column_key: Set of allowed values }
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});

  // Column order (array of column keys)
  const [columnOrder, setColumnOrder] = useState<string[]>(DEFAULT_COLUMNS.map((c) => c.key));

  // Drag state for column reorder
  const [draggedCol, setDraggedCol] = useState<string | null>(null);

  const router = useRouter();
  const { toast } = useToast();

  // Get ordered columns
  const orderedColumns = useMemo(() => {
    return columnOrder
      .map((key) => DEFAULT_COLUMNS.find((c) => c.key === key))
      .filter(Boolean) as ColumnDef[];
  }, [columnOrder]);

  // Apply filters + sort
  const filtered = useMemo(() => {
    let result = contacts.filter((c) => {
      // Text search
      const matchesSearch =
        c.email.toLowerCase().includes(search.toLowerCase()) ||
        (c.first_name && c.first_name.toLowerCase().includes(search.toLowerCase())) ||
        (c.last_name && c.last_name.toLowerCase().includes(search.toLowerCase())) ||
        (c.company && c.company.toLowerCase().includes(search.toLowerCase())) ||
        (c.role && c.role.toLowerCase().includes(search.toLowerCase()));

      // Stage tab filter
      const matchesStage = stageFilter === "all" || c.lead_stage === stageFilter;

      // Column filters
      let matchesColumnFilters = true;
      for (const [key, allowedValues] of Object.entries(columnFilters)) {
        if (allowedValues.size === 0) continue;
        const val = getContactValue(c, key);
        if (!allowedValues.has(val)) {
          matchesColumnFilters = false;
          break;
        }
      }

      return matchesSearch && matchesStage && matchesColumnFilters;
    });

    // Sort
    if (sortKey && sortDir) {
      result = [...result].sort((a, b) => {
        const aVal = getContactValue(a, sortKey).toLowerCase();
        const bVal = getContactValue(b, sortKey).toLowerCase();
        const cmp = aVal.localeCompare(bVal);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [contacts, search, stageFilter, columnFilters, sortKey, sortDir]);

  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(filtered.map((c) => c.id)));
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    setSelected(next);
  }

  function toggleColumnFilter(colKey: string, value: string) {
    setColumnFilters((prev) => {
      const existing = prev[colKey] ? new Set(prev[colKey]) : new Set<string>();
      if (existing.has(value)) {
        existing.delete(value);
      } else {
        existing.add(value);
      }
      return { ...prev, [colKey]: existing };
    });
  }

  function clearColumnFilter(colKey: string) {
    setColumnFilters((prev) => {
      const next = { ...prev };
      delete next[colKey];
      return next;
    });
  }

  function moveColumn(key: string, direction: "left" | "right") {
    setColumnOrder((prev) => {
      const idx = prev.indexOf(key);
      if (idx === -1) return prev;
      const newIdx = direction === "left" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }

  function handleDragStart(key: string) {
    setDraggedCol(key);
  }

  function handleDragOver(e: React.DragEvent, targetKey: string) {
    e.preventDefault();
    if (!draggedCol || draggedCol === targetKey) return;
    setColumnOrder((prev) => {
      const fromIdx = prev.indexOf(draggedCol);
      const toIdx = prev.indexOf(targetKey);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = [...prev];
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, draggedCol);
      return next;
    });
  }

  function handleDragEnd() {
    setDraggedCol(null);
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("contacts").delete().eq("id", deleteId);
    setDeleting(false);
    setDeleteId(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Contact deleted" });
    router.refresh();
  }

  async function handleBulkDelete() {
    setDeleting(true);
    const supabase = createClient();
    const ids = Array.from(selected);
    const { error } = await supabase.from("contacts").delete().in("id", ids);
    setDeleting(false);
    setBulkDelete(false);
    setSelected(new Set());
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${ids.length} contacts deleted` });
    router.refresh();
  }

  const stageCounts = LEAD_STAGES.map((stage) => ({
    ...stage,
    count: contacts.filter((c) => c.lead_stage === stage.value).length,
  }));

  // Active filters indicator
  const activeFilterCount = Object.values(columnFilters).filter((s) => s.size > 0).length;

  // Render cell value
  function renderCell(contact: Contact, colKey: string) {
    switch (colKey) {
      case "first_name":
        return (
          <Link href={`/contacts/${contact.id}`} className="text-sm font-medium hover:underline">
            {contact.first_name || "—"}
          </Link>
        );
      case "last_name":
        return <span className="text-sm">{contact.last_name || ""}</span>;
      case "email":
        return <span className="text-sm text-muted-foreground">{contact.email}</span>;
      case "company":
        return <span className="text-sm">{contact.company || ""}</span>;
      case "role":
        return <span className="text-sm text-muted-foreground">{contact.role || ""}</span>;
      case "lead_stage":
        return <LeadStageBadge contactId={contact.id} stage={contact.lead_stage} />;
      case "status":
        return <ContactStatusBadge status={contact.status} />;
      case "tags":
        return (
          <div className="flex gap-1 flex-wrap">
            {contact.tags.map((tag) => {
              const color = tagColorByName.get(tag);
              const colorClass = color
                ? TAG_COLOR_CLASSES[color]
                : "bg-muted text-muted-foreground border-border";
              return (
                <span key={tag} className={`inline-flex px-1.5 py-0.5 rounded text-[11px] border ${colorClass}`}>
                  {tag}
                </span>
              );
            })}
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-0">
      {/* Tab navigation */}
      <div className="flex items-center gap-0 border-b overflow-x-auto">
        <button
          onClick={() => setStageFilter("all")}
          className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            stageFilter === "all"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          All Contacts <span className="text-xs text-muted-foreground">{contacts.length}</span>
        </button>
        {stageCounts.filter((s) => s.count > 0).map((stage) => (
          <button
            key={stage.value}
            onClick={() => setStageFilter(stage.value)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              stageFilter === stage.value
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {stage.label} <span className="text-xs text-muted-foreground">{stage.count}</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm border-0 rounded-none bg-transparent shadow-none ring-0 outline-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
          />
        </div>
        {activeFilterCount > 0 && (
          <button
            onClick={() => setColumnFilters({})}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted"
          >
            <X className="h-3 w-3" />
            Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
          </button>
        )}
        {sortKey && (
          <button
            onClick={() => { setSortKey(null); setSortDir(null); }}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted"
          >
            <X className="h-3 w-3" />
            Clear sort
          </button>
        )}
        {selected.size > 0 && (
          <>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowSaveList(true)}>
              <ListPlus className="h-3 w-3 mr-1" />
              Save as List ({selected.size})
            </Button>
            <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => setBulkDelete(true)}>
              <Trash2 className="h-3 w-3 mr-1" />
              Delete {selected.size}
            </Button>
          </>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto border-t border-b">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              {/* Select all */}
              <th className="w-8 py-1.5 px-2">
                <button
                  onClick={toggleAll}
                  className={`h-4 w-4 rounded-sm border flex items-center justify-center transition-colors ${
                    allSelected ? "bg-blue-500 border-blue-500" : "border-muted-foreground/25 hover:border-muted-foreground/50"
                  }`}
                >
                  {allSelected && <Check className="h-3 w-3 text-white" />}
                </button>
              </th>

              {/* Column headers with dropdown menus */}
              {orderedColumns.map((col) => {
                const isFiltered = columnFilters[col.key]?.size > 0;
                const isSorted = sortKey === col.key;
                const colIdx = columnOrder.indexOf(col.key);
                const uniqueValues = col.filterable ? getUniqueValues(contacts, col.key) : [];

                return (
                  <th
                    key={col.key}
                    className={`py-1.5 px-2 text-left cursor-grab border-r border-border/40 ${draggedCol === col.key ? "opacity-50" : ""}`}
                    draggable
                    onDragStart={() => handleDragStart(col.key)}
                    onDragOver={(e) => handleDragOver(e, col.key)}
                    onDragEnd={handleDragEnd}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground hover:text-foreground transition-colors w-full group/col">
                          <col.icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1 text-left">{col.label}</span>
                          {isFiltered && (
                            <Filter className="h-3 w-3 text-blue-500 shrink-0" />
                          )}
                          {isSorted ? (
                            sortDir === "asc"
                              ? <ArrowUp className="h-3 w-3 text-blue-500 shrink-0" />
                              : <ArrowDown className="h-3 w-3 text-blue-500 shrink-0" />
                          ) : (
                            <ArrowUp className="h-3 w-3 shrink-0 opacity-0 group-hover/col:opacity-30 transition-opacity" />
                          )}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        {/* Sort options */}
                        {col.sortable && (
                          <>
                            <DropdownMenuItem onClick={() => { setSortKey(col.key); setSortDir("asc"); }}>
                              <ArrowUp className="h-4 w-4 mr-2" />
                              Sort ascending
                              {isSorted && sortDir === "asc" && <Check className="h-3 w-3 ml-auto text-blue-500" />}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setSortKey(col.key); setSortDir("desc"); }}>
                              <ArrowDown className="h-4 w-4 mr-2" />
                              Sort descending
                              {isSorted && sortDir === "desc" && <Check className="h-3 w-3 ml-auto text-blue-500" />}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}

                        {/* Filter options */}
                        {col.filterable && uniqueValues.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs text-muted-foreground">
                              Filter by value
                              {isFiltered && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); clearColumnFilter(col.key); }}
                                  className="ml-2 text-blue-500 hover:underline"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {uniqueValues.slice(0, 20).map((val) => {
                                const isChecked = columnFilters[col.key]?.has(val) || false;
                                return (
                                  <DropdownMenuItem
                                    key={val}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      toggleColumnFilter(col.key, val);
                                    }}
                                  >
                                    <div className={`h-3.5 w-3.5 rounded-sm border mr-2 flex items-center justify-center ${
                                      isChecked ? "bg-blue-500 border-blue-500" : "border-muted-foreground/30"
                                    }`}>
                                      {isChecked && <Check className="h-2.5 w-2.5 text-white" />}
                                    </div>
                                    <span className="text-sm truncate">{val}</span>
                                  </DropdownMenuItem>
                                );
                              })}
                            </div>
                            <DropdownMenuSeparator />
                          </>
                        )}

                        {/* Move column */}
                        <DropdownMenuItem
                          onClick={() => moveColumn(col.key, "left")}
                          disabled={colIdx === 0}
                        >
                          <ArrowLeftToLine className="h-4 w-4 mr-2" />
                          Move left
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => moveColumn(col.key, "right")}
                          disabled={colIdx === columnOrder.length - 1}
                        >
                          <ArrowRightToLine className="h-4 w-4 mr-2" />
                          Move right
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </th>
                );
              })}

              {/* Actions header */}
              <th className="w-16 py-1.5 px-2" />
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length + 2} className="py-12 text-center text-sm text-muted-foreground">
                  {contacts.length === 0 ? "No contacts yet. Add your first contact." : "No contacts match your filter."}
                </td>
              </tr>
            ) : (
              filtered.map((contact) => {
                const isSelected = selected.has(contact.id);
                return (
                  <tr
                    key={contact.id}
                    className={`border-b border-border/50 hover:bg-muted/50 transition-colors group ${isSelected ? "bg-blue-50/50" : ""}`}
                  >
                    <td className="py-1.5 px-2">
                      <button
                        onClick={() => toggleOne(contact.id)}
                        className={`h-4 w-4 rounded-sm border flex items-center justify-center transition-colors ${
                          isSelected
                            ? "bg-blue-500 border-blue-500"
                            : "border-transparent group-hover:border-muted-foreground/25"
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </button>
                    </td>

                    {orderedColumns.map((col) => (
                      <td key={col.key} className="py-1.5 px-2 border-r border-border/40">
                        {renderCell(contact, col.key)}
                      </td>
                    ))}

                    <td className="py-1.5 px-2">
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/contacts/${contact.id}`}>
                          <button className="p-1 rounded hover:bg-muted">
                            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </Link>
                        <button className="p-1 rounded hover:bg-muted" onClick={() => setDeleteId(contact.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="py-2 px-2 text-xs text-muted-foreground">
        {filtered.length} of {contacts.length} contacts
      </div>

      {/* Delete dialogs */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
            <DialogDescription>Are you sure? This will also remove this contact from all campaigns.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDelete} onOpenChange={() => setBulkDelete(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selected.size} Contacts</DialogTitle>
            <DialogDescription>Are you sure? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={deleting}>
              {deleting ? "Deleting..." : `Delete ${selected.size} Contacts`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as List dialog */}
      <Dialog open={showSaveList} onOpenChange={() => setShowSaveList(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save {selected.size} Contacts as List</DialogTitle>
            <DialogDescription>Give your list a name to use it in campaigns.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="list-name">List Name</Label>
            <Input
              id="list-name"
              placeholder="e.g. Q1 SaaS Leads"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveList(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!listName.trim()) {
                  toast({ title: "Error", description: "List name is required", variant: "destructive" });
                  return;
                }
                const supabase = createClient();
                const { data: { user } } = await supabase.auth.getUser();
                const { data: list, error: listError } = await supabase
                  .from("contact_lists")
                  .insert({ user_id: user!.id, name: listName.trim() })
                  .select()
                  .single();
                if (listError || !list) {
                  toast({ title: "Error", description: listError?.message || "Failed", variant: "destructive" });
                  return;
                }
                const items = Array.from(selected).map((contactId) => ({
                  list_id: list.id,
                  contact_id: contactId,
                }));
                await supabase.from("list_contacts").insert(items);
                toast({ title: "List created", description: `"${listName}" with ${selected.size} contacts` });
                setShowSaveList(false);
                setListName("");
                setSelected(new Set());
                router.refresh();
              }}
            >
              Create List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
