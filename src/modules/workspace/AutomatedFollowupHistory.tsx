"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { AutomatedFollowupHistoryItem } from "@/lib/followups/automatedHistoryTypes";

function statusLabelPretty(s: string | null): string {
  if (!s) return "No response yet";
  return s.replaceAll("_", " ");
}

export function AutomatedFollowupHistory() {
  const [items, setItems] = React.useState<AutomatedFollowupHistoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/followups/automated-history", { cache: "no-store", credentials: "include" });
      const j = (await res.json().catch(() => null)) as { items?: AutomatedFollowupHistoryItem[]; error?: string } | null;
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Could not load history.");
      setItems(Array.isArray(j?.items) ? j!.items! : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load history.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const onSent = () => void load();
    window.addEventListener("bacup:automate-followup-sent", onSent);
    return () => window.removeEventListener("bacup:automate-followup-sent", onSent);
  }, [load]);

  return (
    <div className="mt-4 rounded-xl border border-border/60 bg-muted/15 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Automated follow-up history
        </h3>
        <Button type="button" size="sm" variant="ghost" className="h-7 border border-border/60 px-2 text-[11px]" disabled={loading} onClick={() => void load()}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Tasks you emailed from Automate Followups, with the latest assignee-link status when available.
      </p>
      {err ? <p className="mt-2 text-xs text-red-700 dark:text-red-300">{err}</p> : null}
      {loading && items.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No automated follow-ups recorded yet.</p>
      ) : (
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-0.5">
          {items.map((it) => (
            <li key={it.task_id} className="rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-xs shadow-sm">
              <div className="font-medium text-foreground">{it.title || "(untitled)"}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                <span>{it.assigned_to?.trim() ? it.assigned_to : "Unassigned"}</span>
                <span>·</span>
                <span>Sent {it.sent_at ? new Date(it.sent_at).toLocaleString() : "—"}</span>
                <span>·</span>
                <span className="capitalize">Task: {it.task_status}</span>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                Assignee link: <span className="font-medium text-foreground/90">{statusLabelPretty(it.latest_web_status_label)}</span>
                {it.latest_web_event_at ? (
                  <span className="text-muted-foreground"> · {new Date(it.latest_web_event_at).toLocaleString()}</span>
                ) : null}
              </div>
              {it.latest_web_preview ? (
                <div className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{it.latest_web_preview}</div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
