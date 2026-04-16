"use client";

import * as React from "react";
import Link from "next/link";

import type { Task } from "@/store/taskStore";
import { isTaskOverdue } from "@/lib/tasks/taskOverdue";

function ymdToday(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function briefStats(tasks: Task[]) {
  const today = ymdToday();
  const now = new Date();
  const pending = tasks.filter((t) => t.status === "pending");
  return {
    overdue: pending.filter((t) => isTaskOverdue(t, now)).length,
    todaysLoad: pending.filter((t) => t.due_date === today).length,
    waitingFollowups: pending.filter((t) => t.type === "followup").length,
    activePriorities: pending.filter((t) => t.type === "todo").length,
  };
}

export function MyViewHub() {
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [brief, setBrief] = React.useState<ReturnType<typeof briefStats> | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/overview", { credentials: "include" });
        const j = (await res.json().catch(() => null)) as { tasks?: Task[]; error?: string } | null;
        if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Failed to load");
        const tasks = Array.isArray(j?.tasks) ? j.tasks! : [];
        if (!cancelled) setBrief(briefStats(tasks));
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading My View…</div>;
  }

  if (err) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
        {err}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Personal</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">My View</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Your tasks and rhythm in one place.{" "}
          <span className="text-foreground/90">
            Business OS (decisions, approvals) is included on <strong>Executive OS</strong>.
          </span>
        </p>
      </header>

      {brief ? (
        <section aria-labelledby="my-brief-heading">
          <h2 id="my-brief-heading" className="mb-3 text-sm font-semibold text-foreground">
            Today at a glance
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["Overdue", brief.overdue],
                ["Today's load", brief.todaysLoad],
                ["Follow-ups", brief.waitingFollowups],
                ["Priorities", brief.activePriorities],
              ] as const
            ).map(([k, v]) => (
              <div
                key={k}
                className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 shadow-sm"
              >
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{v}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Need the founder workspace?</p>
          <p className="text-xs text-muted-foreground">Upgrade to Executive OS for Business OS, team surfaces, and more.</p>
        </div>
        <Link
          href="/settings"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 sm:w-auto"
        >
          View plans
        </Link>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Shortcuts</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard"
            className="rounded-lg border border-border/80 bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted/50"
          >
            Dashboard
          </Link>
          <Link
            href="/calendar"
            className="rounded-lg border border-border/80 bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted/50"
          >
            Calendar
          </Link>
          <Link
            href="/scratchpad"
            className="rounded-lg border border-border/80 bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted/50"
          >
            Scratchpad
          </Link>
        </div>
      </section>
    </div>
  );
}
