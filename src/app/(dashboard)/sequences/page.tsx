import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, GitBranch } from "lucide-react";
import { SEQUENCE_STATUSES } from "@/lib/constants";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export default async function SequencesPage() {
  const supabase = createClient();

  const { data: sequences } = await supabase
    .from("sequences")
    .select("*")
    .order("created_at", { ascending: false });

  // Step counts and enrollment counts for each sequence
  type Row = {
    id: string;
    name: string;
    status: string;
    created_at: string;
    step_count: number;
    enrolled_count: number;
    active_count: number;
  };
  const rows: Row[] = [];
  for (const s of sequences || []) {
    const { count: stepCount } = await supabase
      .from("sequence_steps")
      .select("*", { count: "exact", head: true })
      .eq("sequence_id", s.id);
    const { count: enrolled } = await supabase
      .from("enrollments")
      .select("*", { count: "exact", head: true })
      .eq("sequence_id", s.id);
    const { count: active } = await supabase
      .from("enrollments")
      .select("*", { count: "exact", head: true })
      .eq("sequence_id", s.id)
      .eq("status", "active");
    rows.push({
      id: s.id,
      name: s.name,
      status: s.status,
      created_at: s.created_at,
      step_count: stepCount || 0,
      enrolled_count: enrolled || 0,
      active_count: active || 0,
    });
  }

  const statusColor = (v: string) =>
    SEQUENCE_STATUSES.find((s) => s.value === v)?.color || "bg-gray-100 text-gray-800";

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Sequences</h1>
          <Badge variant="outline" className="text-[10px]">v2 preview</Badge>
        </div>
        <Link href="/sequences/new">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New sequence
          </Button>
        </Link>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Multi-step cold outreach with conditional branching. Replaces &ldquo;Campaigns&rdquo; once you&rsquo;re happy with it.
      </p>

      {rows.length === 0 ? (
        <div className="border rounded-md p-12 text-center">
          <GitBranch className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
          <h3 className="font-medium mb-1">No sequences yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            A sequence is a multi-step cold outreach: email → wait → condition → email…
          </p>
          <Link href="/sequences/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Create your first sequence
            </Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Steps</TableHead>
                <TableHead className="text-right">Enrolled</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/sequences/${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`${statusColor(r.status)} w-fit`}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{r.step_count}</TableCell>
                  <TableCell className="text-right">{r.enrolled_count}</TableCell>
                  <TableCell className="text-right">{r.active_count}</TableCell>
                  <TableCell>{formatDate(r.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
