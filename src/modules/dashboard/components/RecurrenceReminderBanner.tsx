"use client";

import * as React from "react";

type Item = { id: string; title: string };

export function RecurrenceReminderBanner({
  onResolved,
}: {
  onResolved: () => void;
}) {
  const [items, setItems] = React.useState<Item[]>([]);
  const [times, setTimes] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/recurrence/pending-reminders", { cache: "no-store" });
      const j = (await res.json().catch(() => null)) as { items?: Item[] } | null;
      const list = res.ok && Array.isArray(j?.items) ? j.items : [];
      setItems(list);
      setTimes((prev) => {
        const next = { ...prev };
        for (const it of list) {
          if (next[it.id] == null) next[it.id] = "09:00";
        }
        return next;
      });
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (items.length === 0) return null;

  const confirm = async (seriesId: string) => {
    const time = (times[seriesId] ?? "09:00").slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(time)) return;
    setBusy(seriesId);
    try {
      const res = await fetch(`/api/recurrence/series/${encodeURIComponent(seriesId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reminder_time: time,
          reminder_setup_status: "complete",
          reminder_enabled: true,
        }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== seriesId));
        onResolved();
      }
    } finally {
      setBusy(null);
    }
  };

  const skip = async (seriesId: string) => {
    setBusy(seriesId);
    try {
      const res = await fetch(`/api/recurrence/series/${encodeURIComponent(seriesId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reminder_setup_status: "skipped",
          reminder_enabled: false,
        }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== seriesId));
        onResolved();
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-sky-500/35 bg-sky-50/90 px-3 py-2.5 dark:bg-sky-500/10">
      <div className="text-[11px] font-semibold text-foreground">Recurring reminders</div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Confirm when each occurrence should notify you. You can skip reminders and keep only the
        list entries.
      </p>
      <ul className="mt-2 space-y-2">
        {items.map((it) => (
          <li
            key={it.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-2 py-1.5"
          >
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground" title={it.title}>
              {it.title}
            </span>
            <input
              type="time"
              value={times[it.id] ?? "09:00"}
              onChange={(e) => setTimes((s) => ({ ...s, [it.id]: e.target.value }))}
              className="h-8 rounded-md border border-border px-1 text-xs"
              aria-label={`Reminder time for ${it.title}`}
            />
            <button
              type="button"
              disabled={busy === it.id}
              onClick={() => void confirm(it.id)}
              className="rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              type="button"
              disabled={busy === it.id}
              onClick={() => void skip(it.id)}
              className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/60 disabled:opacity-50"
            >
              No reminders
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
