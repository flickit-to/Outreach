"use client";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export function SendDaysPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (days: number[]) => void;
}) {
  function toggle(day: number) {
    if (value.includes(day)) {
      onChange(value.filter((d) => d !== day));
    } else {
      onChange([...value, day].sort());
    }
  }

  return (
    <div className="flex gap-1.5 flex-wrap">
      {DAYS.map((d) => {
        const active = value.includes(d.value);
        const isWeekend = d.value === 0 || d.value === 6;
        return (
          <button
            key={d.value}
            type="button"
            onClick={() => toggle(d.value)}
            className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
              active
                ? isWeekend
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-input hover:border-foreground"
            }`}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}
