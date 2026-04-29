"use client";

export function VariableChips({
  variables,
  onInsert,
  prefix = "Variables (click to insert):",
}: {
  variables: string[];
  onInsert: (variable: string) => void;
  prefix?: string;
}) {
  return (
    <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
      <span>{prefix}</span>
      {variables.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onInsert(v)}
          className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted transition-colors"
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// Helper: insert text at the current cursor position of an input/textarea.
// Returns the new value and the cursor position to restore. Caller is
// responsible for writing the new value into form state and (after the
// re-render) restoring focus + selection on the same element.
export function insertAtCursor(
  el: HTMLInputElement | HTMLTextAreaElement,
  insertion: string,
): { next: string; cursor: number } {
  const value = el.value;
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? start;
  const next = value.slice(0, start) + insertion + value.slice(end);
  return { next, cursor: start + insertion.length };
}
