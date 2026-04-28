import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Mail, Hourglass, GitBranch, ArrowLeft } from "lucide-react";
import { SEQUENCE_STATUSES, STEP_CONDITION_TRIGGERS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { SequenceActionBar } from "@/components/sequences/sequence-action-bar";

const STEP_ICONS: Record<string, { icon: typeof Mail; color: string }> = {
  email: { icon: Mail, color: "text-blue-600" },
  wait: { icon: Hourglass, color: "text-amber-600" },
  condition: { icon: GitBranch, color: "text-purple-600" },
};

export default async function SequenceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: sequence } = await supabase
    .from("sequences")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!sequence) notFound();

  const { data: steps } = await supabase
    .from("sequence_steps")
    .select("*")
    .eq("sequence_id", params.id)
    .order("step_order", { ascending: true });

  const { count: enrolled } = await supabase
    .from("enrollments")
    .select("*", { count: "exact", head: true })
    .eq("sequence_id", params.id);

  const { count: active } = await supabase
    .from("enrollments")
    .select("*", { count: "exact", head: true })
    .eq("sequence_id", params.id)
    .eq("status", "active");

  let listName: string | null = null;
  if (sequence.list_id) {
    const { data } = await supabase
      .from("contact_lists")
      .select("name")
      .eq("id", sequence.list_id)
      .maybeSingle();
    listName = data?.name ?? null;
  }
  let senderLabel: string | null = null;
  if (sequence.from_email_id) {
    const { data } = await supabase
      .from("sender_emails")
      .select("name, email")
      .eq("id", sequence.from_email_id)
      .maybeSingle();
    if (data) senderLabel = `${data.name} <${data.email}>`;
  }

  const statusColor =
    SEQUENCE_STATUSES.find((s) => s.value === sequence.status)?.color ||
    "bg-gray-100 text-gray-800";

  const triggerLabel = (v: string) =>
    STEP_CONDITION_TRIGGERS.find((t) => t.value === v)?.label || v;

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="max-w-3xl">
      <Link
        href="/sequences"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        All sequences
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold">{sequence.name}</h1>
            <Badge variant="secondary" className={statusColor}>
              {sequence.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Created {formatDate(sequence.created_at)} · {steps?.length ?? 0} steps · {enrolled ?? 0} enrolled ({active ?? 0} active)
          </p>
        </div>
        <SequenceActionBar
          sequenceId={sequence.id}
          sequenceName={sequence.name}
          status={sequence.status}
          hasList={!!sequence.list_id}
          hasSteps={(steps?.length ?? 0) > 0}
        />
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">List</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              {listName || <span className="text-muted-foreground">No list selected</span>}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">From</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium truncate">
              {senderLabel || <span className="text-muted-foreground">Auto-rotate</span>}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Send days</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              {(sequence.send_days || []).map((d: number) => dayLabels[d]).join(" · ") || "Any"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(!steps || steps.length === 0) && (
            <p className="text-sm text-muted-foreground">No steps in this sequence.</p>
          )}
          {steps?.map((step, idx) => {
            const meta = STEP_ICONS[step.type];
            const Icon = meta.icon;
            return (
              <div key={step.id} className="border rounded-md">
                <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
                  <span className="text-xs font-mono text-muted-foreground">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <Icon className={`h-4 w-4 ${meta.color}`} />
                  <span className="text-sm font-medium capitalize">{step.type}</span>
                  {step.type === "email" && step.send_as_reply && (
                    <Badge variant="outline" className="text-[10px]">threaded reply</Badge>
                  )}
                </div>
                <div className="p-3 text-sm">
                  {step.type === "email" && (
                    <>
                      <div className="font-medium">{step.subject}</div>
                      <div className="text-muted-foreground whitespace-pre-wrap mt-1 line-clamp-3">
                        {step.body}
                      </div>
                    </>
                  )}
                  {step.type === "wait" && (
                    <div>Wait <span className="font-medium">{step.delay_days}</span> day{step.delay_days === 1 ? "" : "s"}</div>
                  )}
                  {step.type === "condition" && (
                    <div>
                      If contact has{" "}
                      {(step.triggers || []).map((t: string, i: number) => (
                        <span key={t}>
                          <Badge variant="outline" className="mx-0.5 text-[11px]">
                            {triggerLabel(t)}
                          </Badge>
                          {i < (step.triggers || []).length - 1 && " or "}
                        </span>
                      ))}{" "}
                      within <span className="font-medium">{step.within_days}</span> days, continue.
                      Otherwise, end sequence.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <EnrollmentsTable sequenceId={sequence.id} />
    </div>
  );
}

async function EnrollmentsTable({ sequenceId }: { sequenceId: string }) {
  const supabase = createClient();
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select(
      `id, status, current_step_id, next_run_at, enrolled_at, completed_at, exit_reason,
       contacts:contact_id(id, email, first_name, last_name, lead_stage),
       step:current_step_id(step_order, type)`,
    )
    .eq("sequence_id", sequenceId)
    .order("enrolled_at", { ascending: false })
    .limit(50);

  if (!enrollments || enrollments.length === 0) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Enrollments</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No contacts enrolled yet. Activate the sequence to enrol everyone on the list.
          </p>
        </CardContent>
      </Card>
    );
  }

  const fmtRelative = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    const diff = d.getTime() - Date.now();
    const abs = Math.abs(diff);
    const min = Math.round(abs / 60_000);
    const hr = Math.round(abs / 3_600_000);
    const day = Math.round(abs / 86_400_000);
    const pretty =
      abs < 60_000 ? "<1m"
        : min < 60 ? `${min}m`
        : hr < 24 ? `${hr}h`
        : `${day}d`;
    return diff > 0 ? `in ${pretty}` : `${pretty} ago`;
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Enrollments ({enrollments.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Current step</TableHead>
              <TableHead>Next run</TableHead>
              <TableHead>Lead stage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrollments.map((e: any) => {
              const c = e.contacts;
              const stepLabel = e.step
                ? `${String(e.step.step_order).padStart(2, "0")} · ${e.step.type}`
                : "—";
              const statusBadgeColor =
                e.status === "active" ? "bg-blue-100 text-blue-700"
                : e.status === "completed" ? "bg-green-100 text-green-700"
                : e.status === "exited" ? "bg-gray-100 text-gray-700"
                : e.status === "paused" ? "bg-yellow-100 text-yellow-800"
                : "bg-gray-100 text-gray-700";
              return (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="text-sm">
                      <div className="font-medium">
                        {[c?.first_name, c?.last_name].filter(Boolean).join(" ") || c?.email || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">{c?.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusBadgeColor}>
                      {e.status}
                    </Badge>
                    {e.exit_reason && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {e.exit_reason}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs font-mono">{stepLabel}</TableCell>
                  <TableCell className="text-xs">{fmtRelative(e.next_run_at)}</TableCell>
                  <TableCell className="text-xs">{c?.lead_stage}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
