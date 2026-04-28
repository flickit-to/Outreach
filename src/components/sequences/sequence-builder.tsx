"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SendDaysPicker } from "@/components/campaigns/send-days-picker";
import { STEP_CONDITION_TRIGGERS } from "@/lib/constants";
import { createSequence, updateSequence } from "@/app/(dashboard)/sequences/actions";
import type {
  ContactListWithCount,
  SenderEmail,
  SequenceStep as SequenceStepRow,
} from "@/lib/types";
import {
  Mail,
  Hourglass,
  GitBranch,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

// Local step shapes (kept loose; server validator is the source of truth)
type EmailStep = {
  type: "email";
  subject: string;
  subject_b?: string;
  body: string;
  send_as_reply: boolean;
};
type WaitStep = { type: "wait"; delay_days: number };
type ConditionStep = {
  type: "condition";
  triggers: string[];
  within_days: number;
};
type Step = EmailStep | WaitStep | ConditionStep;

const STEP_META: Record<
  Step["type"],
  { label: string; icon: typeof Mail; color: string }
> = {
  email: { label: "Email", icon: Mail, color: "text-blue-600" },
  wait: { label: "Wait", icon: Hourglass, color: "text-amber-600" },
  condition: { label: "Condition", icon: GitBranch, color: "text-purple-600" },
};

function defaultStep(type: Step["type"]): Step {
  if (type === "email")
    return { type, subject: "", body: "", send_as_reply: false };
  if (type === "wait") return { type, delay_days: 2 };
  return { type: "condition", triggers: ["opened"], within_days: 3 };
}

// Convert a DB step row into the local Step shape used by the builder.
function rowToLocalStep(row: SequenceStepRow): Step {
  if (row.type === "email") {
    return {
      type: "email",
      subject: row.subject || "",
      subject_b: row.subject_b || undefined,
      body: row.body || "",
      send_as_reply: !!row.send_as_reply,
    };
  }
  if (row.type === "wait") {
    return { type: "wait", delay_days: row.delay_days ?? 2 };
  }
  return {
    type: "condition",
    triggers: row.triggers || ["opened"],
    within_days: row.within_days ?? 3,
  };
}

export interface SequenceBuilderInitial {
  id: string;
  name: string;
  listId: string | null;
  fromEmailId: string | null;
  sendDays: number[];
  steps: SequenceStepRow[];
}

export function SequenceBuilder({
  lists,
  senderEmails,
  userId,
  initial,
}: {
  lists: ContactListWithCount[];
  senderEmails: SenderEmail[];
  userId: string; // unused for now but matches campaign-form signature
  initial?: SequenceBuilderInitial;
}) {
  void userId;
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [listId, setListId] = useState<string>(initial?.listId ?? "");
  const [fromEmailId, setFromEmailId] = useState<string>(initial?.fromEmailId ?? "");
  const [sendDays, setSendDays] = useState<number[]>(initial?.sendDays ?? [1, 2, 3, 4, 5]);
  const [steps, setSteps] = useState<Step[]>(
    initial?.steps?.length ? initial.steps.map(rowToLocalStep) : [defaultStep("email")],
  );
  const [saving, setSaving] = useState(false);

  const addStep = (type: Step["type"], at: number) => {
    setSteps((prev) => {
      const next = [...prev];
      next.splice(at, 0, defaultStep(type));
      return next;
    });
  };
  const removeStep = (idx: number) =>
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  const moveStep = (idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };
  const updateStep = (idx: number, partial: Partial<Step>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? ({ ...s, ...partial } as Step) : s)),
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Name required", description: "Give your sequence a name.", variant: "destructive" });
      return;
    }
    if (steps.length === 0) {
      toast({ title: "No steps", description: "Add at least one step.", variant: "destructive" });
      return;
    }
    // Light client validation
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.type === "email" && (!s.subject.trim() || !s.body.trim())) {
        toast({ title: `Step ${i + 1} incomplete`, description: "Email needs a subject and body.", variant: "destructive" });
        return;
      }
      if (s.type === "wait" && (s.delay_days < 0 || s.delay_days > 365)) {
        toast({ title: `Step ${i + 1} invalid wait`, variant: "destructive" });
        return;
      }
      if (s.type === "condition" && s.triggers.length === 0) {
        toast({ title: `Step ${i + 1} needs a trigger`, variant: "destructive" });
        return;
      }
    }

    setSaving(true);
    const payload = {
      name: name.trim(),
      list_id: listId || null,
      from_email_id: fromEmailId || null,
      send_days: sendDays,
      steps: steps as never, // discriminated union — server re-validates
    };
    const result = isEdit
      ? await updateSequence(initial!.id, payload)
      : await createSequence(payload);
    setSaving(false);
    if (!result.ok) {
      toast({ title: "Save failed", description: result.error, variant: "destructive" });
      return;
    }
    if (isEdit) {
      toast({ title: "Sequence updated", description: `${steps.length} steps saved.` });
      router.push(`/sequences/${initial!.id}`);
      router.refresh();
    } else {
      toast({ title: "Sequence created", description: `${steps.length} steps saved as draft.` });
      router.push(`/sequences/${(result as { id: string }).id}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="seq-name">Sequence name</Label>
            <Input
              id="seq-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cold outreach to ANZ CIOs"
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Recipient list</Label>
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a list" />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} ({l.contact_count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>From email</Label>
              <Select value={fromEmailId} onValueChange={setFromEmailId}>
                <SelectTrigger>
                  <SelectValue placeholder="Auto-rotate available senders" />
                </SelectTrigger>
                <SelectContent>
                  {senderEmails.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} &lt;{s.email}&gt;
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Send days</Label>
            <SendDaysPicker value={sendDays} onChange={setSendDays} />
          </div>
        </CardContent>
      </Card>

      {/* Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {steps.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No steps yet. Add the first one below.
            </p>
          )}
          {steps.map((step, idx) => (
            <div key={idx}>
              <StepCard
                step={step}
                index={idx}
                total={steps.length}
                onChange={(partial) => updateStep(idx, partial)}
                onRemove={() => removeStep(idx)}
                onMoveUp={() => moveStep(idx, -1)}
                onMoveDown={() => moveStep(idx, 1)}
              />
              <AddStepRow onAdd={(type) => addStep(type, idx + 1)} />
            </div>
          ))}
          {steps.length === 0 && (
            <AddStepRow onAdd={(type) => addStep(type, 0)} />
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() =>
            router.push(isEdit ? `/sequences/${initial!.id}` : "/sequences")
          }
          disabled={saving}
        >
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Save as draft"}
        </Button>
      </div>
    </div>
  );
}

// ─── StepCard ────────────────────────────────────────────────────────────────
function StepCard({
  step,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  step: Step;
  index: number;
  total: number;
  onChange: (partial: Partial<Step>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const meta = STEP_META[step.type];
  const Icon = meta.icon;

  return (
    <div className="border rounded-md bg-card">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">
            {String(index + 1).padStart(2, "0")}
          </span>
          <Icon className={`h-4 w-4 ${meta.color}`} />
          <span className="text-sm font-medium">{meta.label}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveUp} disabled={index === 0}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveDown} disabled={index === total - 1}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="p-3 space-y-3">
        {step.type === "email" && (
          <EmailStepEditor step={step} onChange={onChange} />
        )}
        {step.type === "wait" && <WaitStepEditor step={step} onChange={onChange} />}
        {step.type === "condition" && (
          <ConditionStepEditor step={step} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

// ─── Editors per step type ───────────────────────────────────────────────────
function EmailStepEditor({
  step,
  onChange,
}: {
  step: EmailStep;
  onChange: (p: Partial<EmailStep>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Subject</Label>
        <Input
          value={step.subject}
          onChange={(e) => onChange({ subject: e.target.value })}
          placeholder="e.g. Quick question"
        />
      </div>
      <div>
        <Label className="text-xs">Body</Label>
        <Textarea
          value={step.body}
          onChange={(e) => onChange({ body: e.target.value })}
          placeholder={"Hi {{first_name}},\n\n…"}
          rows={6}
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Variables: {"{{first_name}}, {{last_name}}, {{company}}, {{role}}"}
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={step.send_as_reply}
          onChange={(e) => onChange({ send_as_reply: e.target.checked })}
          className="h-4 w-4"
        />
        Send as reply (threaded under previous email)
      </label>
    </div>
  );
}

function WaitStepEditor({
  step,
  onChange,
}: {
  step: WaitStep;
  onChange: (p: Partial<WaitStep>) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">Wait</span>
      <Input
        type="number"
        min={0}
        max={365}
        value={step.delay_days}
        onChange={(e) => onChange({ delay_days: Number(e.target.value) })}
        className="w-24"
      />
      <span className="text-sm">days before next step</span>
    </div>
  );
}

function ConditionStepEditor({
  step,
  onChange,
}: {
  step: ConditionStep;
  onChange: (p: Partial<ConditionStep>) => void;
}) {
  const toggle = (val: string) => {
    onChange({
      triggers: step.triggers.includes(val)
        ? step.triggers.filter((t) => t !== val)
        : [...step.triggers, val],
    });
  };
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">If contact has…</Label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {STEP_CONDITION_TRIGGERS.map((t) => {
            const on = step.triggers.includes(t.value);
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => toggle(t.value)}
                className={`px-2.5 py-1 rounded-full text-xs border transition ${
                  on
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:border-primary"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm">within</span>
        <Input
          type="number"
          min={1}
          max={60}
          value={step.within_days}
          onChange={(e) => onChange({ within_days: Number(e.target.value) })}
          className="w-20"
        />
        <span className="text-sm">days, continue. Otherwise, end sequence.</span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Multiple triggers = OR (any one matches). v1: branch ends if condition fails.
      </p>
    </div>
  );
}

// ─── Add step row ────────────────────────────────────────────────────────────
function AddStepRow({ onAdd }: { onAdd: (type: Step["type"]) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full mt-2 mb-2 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded hover:border-primary transition flex items-center justify-center gap-1"
      >
        <Plus className="h-3 w-3" />
        Add step
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 my-2 p-2 border border-dashed rounded">
      <span className="text-xs text-muted-foreground">Add:</span>
      {(["email", "wait", "condition"] as const).map((t) => {
        const m = STEP_META[t];
        const Icon = m.icon;
        return (
          <Button
            key={t}
            variant="outline"
            size="sm"
            onClick={() => {
              onAdd(t);
              setOpen(false);
            }}
          >
            <Icon className={`h-3.5 w-3.5 mr-1 ${m.color}`} />
            {m.label}
          </Button>
        );
      })}
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="ml-auto">
        Cancel
      </Button>
    </div>
  );
}
