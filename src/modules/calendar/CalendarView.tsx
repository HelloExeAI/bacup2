"use client";

import { useEventStore } from "@/store/eventStore";

function fmtTime(t: string | null) {
  if (!t) return null;
  // Accept HH:MM:SS or HH:MM
  const m = t.match(/^(\d{2}):(\d{2})/);
  if (!m) return t;
  return `${m[1]}:${m[2]}`;
}

export function CalendarView() {
  const events = useEventStore((s) => s.events);

  if (events.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-lg font-semibold">Calendar</h1>
        <p className="text-sm text-muted-foreground">No events yet.</p>
      </div>
    );
  }

  const byDate = new Map<string, typeof events>();
  for (const e of events) {
    const key = e.date ?? "Unknown date";
    const list = byDate.get(key) ?? [];
    list.push(e);
    byDate.set(key, list);
  }

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">Calendar</h1>
      <div className="space-y-3">
        {[...byDate.entries()].map(([date, list]) => (
          <section
            key={date}
            className="rounded-lg border border-border bg-background p-4"
          >
            <div className="text-sm font-semibold">{date}</div>
            <div className="mt-2 space-y-2">
              {list.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {e.title ?? "Untitled"}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {fmtTime(e.time)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

