"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { Task } from "@/store/taskStore";

function computeDeadlineIso(task: Task, defaultHours: number): string {
  if (task.due_date && /^\d{4}-\d{2}-\d{2}$/.test(task.due_date)) {
    const [y, m, d] = task.due_date.split("-").map(Number);
    const time = String(task.due_time || "17:00").padStart(5, "0");
    const [hh, mm] = time.split(":").map(Number);
    const local = new Date(y, (m ?? 1) - 1, d, hh || 17, mm || 0, 0, 0);
    if (!Number.isNaN(local.getTime())) {
      return local.toISOString();
    }
  }
  const x = new Date();
  x.setHours(x.getHours() + defaultHours);
  return x.toISOString();
}

export function TaskFollowAutomationInline({
  task,
  disabled,
}: {
  task: Task;
  disabled?: boolean;
}) {
  const [sub, setSub] = React.useState<{
    enabled: boolean;
    assignee_email: string;
    response_deadline_at: string;
  } | null>(null);
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [defaultHours, setDefaultHours] = React.useState(2);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [subRes, stRes] = await Promise.all([
        fetch(`/api/workspace/follow-tasks?taskId=${encodeURIComponent(task.id)}`, { credentials: "include" }),
        fetch("/api/workspace/follow-settings", { credentials: "include" }),
      ]);
      const sj = await subRes.json().catch(() => null);
      const stj = await stRes.json().catch(() => null);
      if (!subRes.ok) throw new Error(typeof sj?.error === "string" ? sj.error : "Failed to load");
      const s = sj?.subscription as
        | {
            enabled: boolean;
            assignee_email: string;
            response_deadline_at: string;
          }
        | null
        | undefined;
      if (s) {
        setSub({ enabled: s.enabled, assignee_email: s.assignee_email, response_deadline_at: s.response_deadline_at });
        setEmail(s.assignee_email);
      } else {
        setSub(null);
        setEmail("");
      }
      const dh = stj?.settings?.default_response_hours;
      if (typeof dh === "number") setDefaultHours(dh);
    } catch (e) {
      if (e instanceof Error && e.message.includes("403")) {
        setErr("Follow automation requires Business OS (Executive OS).");
      } else {
        setErr(e instanceof Error ? e.message : "Failed to load");
      }
    } finally {
      setLoading(false);
    }
  }, [task.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const enrolled = Boolean(sub?.enabled);

  const enroll = async () => {
    const to = email.trim();
    if (!to) {
      setErr("Enter assignee email.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const deadline = computeDeadlineIso(task, defaultHours);
      const res = await fetch("/api/workspace/follow-tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          task_id: task.id,
          assignee_email: to,
          response_deadline_at: deadline,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Could not enroll");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not enroll");
    } finally {
      setBusy(false);
    }
  };

  const unenroll = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/workspace/follow-tasks?taskId=${encodeURIComponent(task.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(typeof j?.error === "string" ? j.error : "Could not remove");
      }
      setSub(null);
      setEmail("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="mt-3 text-[11px] text-muted-foreground">Loading follow automation…</p>;
  }

  if (err?.includes("403") || err?.includes("Business OS")) {
    return (
      <p className="mt-3 text-[11px] text-muted-foreground">
        Follow automation (Phase C) is available on Executive OS with Business OS.
      </p>
    );
  }

  return (
    <div className="mt-4 border-t border-border/60 pt-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Automate Followups</div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Bacup can send status nudges on your behalf from your chosen Google account (see Settings → Follow
        automation). Enroll per task with the assignee&apos;s email.
      </p>
      {err ? <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{err}</p> : null}
      <div className="mt-2 flex flex-col gap-2">
        <input
          type="email"
          className="h-9 rounded-md border border-border bg-background px-2 text-xs"
          placeholder="assignee@company.com"
          value={email}
          disabled={disabled || busy || enrolled}
          onChange={(e) => setEmail(e.target.value)}
        />
        {enrolled ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-emerald-700 dark:text-emerald-400">Enrolled — nudges use your automation rules.</span>
            <Button type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={() => void unenroll()}>
              Stop following
            </Button>
          </div>
        ) : (
          <Button type="button" size="sm" disabled={disabled || busy} onClick={() => void enroll()}>
            Enroll this task
          </Button>
        )}
      </div>
    </div>
  );
}
