"use client";

import * as React from "react";

const btnPrimary =
  "rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60";

type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "half_yearly" | "yearly";

const FREQUENCIES: { id: Frequency; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "half_yearly", label: "Every 6 months" },
  { id: "yearly", label: "Yearly" },
];

export function RecurringTaskModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<"todo" | "followup" | "reminder">("reminder");
  const [firstDueDate, setFirstDueDate] = React.useState(() => {
    const n = new Date();
    const y = n.getFullYear();
    const m = String(n.getMonth() + 1).padStart(2, "0");
    const d = String(n.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [dueTime, setDueTime] = React.useState("09:00");
  const [frequency, setFrequency] = React.useState<Frequency>("weekly");
  const [reminderEnabled, setReminderEnabled] = React.useState(true);
  const [reminderTime, setReminderTime] = React.useState("09:00");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setErr(null);
    }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    const t = title.trim();
    if (!t) {
      setErr("Add a title.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      let reminder: { enabled: false } | { enabled: true; time: string | null };
      if (!reminderEnabled) {
        reminder = { enabled: false };
      } else if (reminderTime.trim()) {
        reminder = { enabled: true, time: reminderTime.slice(0, 5) };
      } else {
        reminder = { enabled: true, time: null };
      }

      const res = await fetch("/api/recurrence/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          type,
          first_due_date: firstDueDate,
          due_time: dueTime.slice(0, 5),
          recurrence: { frequency },
          reminder,
        }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setErr(j?.error || `Failed (${res.status})`);
        return;
      }
      onCreated();
      onClose();
      setTitle("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recurring-modal-title"
    >
      <div className="max-h-[min(90vh,32rem)] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-background p-4 shadow-lg">
        <h2 id="recurring-modal-title" className="text-sm font-semibold text-foreground">
          Add recurring task
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Only the next occurrence appears in your list. When you complete it, the following one is
          scheduled automatically.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-muted/25 px-2 text-sm"
              placeholder="e.g. Weekly report"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="h-9 w-full rounded-md border border-border bg-muted/25 px-2 text-sm"
            >
              <option value="todo">Todo</option>
              <option value="followup">Follow-up</option>
              <option value="reminder">Reminder</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground">First due date</span>
              <input
                type="date"
                value={firstDueDate}
                onChange={(e) => setFirstDueDate(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-muted/25 px-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground">Due time</span>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-muted/25 px-2 text-sm"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground">Repeats</span>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              className="h-9 w-full rounded-md border border-border bg-muted/25 px-2 text-sm"
            >
              {FREQUENCIES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-xs leading-snug">
                <span className="font-medium text-foreground">Remind me for each occurrence</span>
                <span className="mt-0.5 block text-muted-foreground">
                  If enabled, you can set a time now. If you leave the time empty, we’ll ask once
                  before reminders are turned on.
                </span>
              </span>
            </label>
            {reminderEnabled ? (
              <label className="mt-2 block space-y-1 pl-6">
                <span className="text-[10px] font-semibold text-muted-foreground">
                  Reminder time (optional)
                </span>
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="h-8 w-full max-w-[10rem] rounded-md border border-border bg-background px-2 text-xs"
                />
              </label>
            ) : null}
          </div>
        </div>

        {err ? <p className="mt-3 text-xs text-red-600 dark:text-red-400">{err}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
