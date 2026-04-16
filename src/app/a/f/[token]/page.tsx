"use client";

import * as React from "react";
import { useParams } from "next/navigation";

type TaskRow = { id: string; title: string };

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; assignee_email: string; expires_at: string; tasks: TaskRow[] };

type PerTask = { status: "completed" | "in_progress" | "not_started"; note: string };

export default function AssigneeFollowupPublicPage() {
  const params = useParams();
  const token = typeof params?.token === "string" ? params.token : "";

  const [load, setLoad] = React.useState<LoadState>({ status: "loading" });
  const [byId, setById] = React.useState<Record<string, PerTask>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [doneMsg, setDoneMsg] = React.useState<string | null>(null);
  const [errMsg, setErrMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) {
      setLoad({ status: "error", message: "Invalid link." });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/public/assignee-followup?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (cancelled) return;
        if (!res.ok) {
          const code = typeof j?.error === "string" ? j.error : "failed";
          if (res.status === 410) {
            setLoad({ status: "error", message: "This link has expired or is no longer valid." });
            return;
          }
          if (code === "not_found") {
            setLoad({ status: "error", message: "This link is not valid." });
            return;
          }
          setLoad({ status: "error", message: "Could not load this page. Try again later." });
          return;
        }
        const tasks = Array.isArray(j?.tasks) ? (j.tasks as TaskRow[]) : [];
        const assignee_email = typeof j?.assignee_email === "string" ? j.assignee_email : "";
        const expires_at = typeof j?.expires_at === "string" ? j.expires_at : "";
        const init: Record<string, PerTask> = {};
        for (const t of tasks) {
          init[t.id] = { status: "in_progress", note: "" };
        }
        setById(init);
        setLoad({ status: "ready", assignee_email, expires_at, tasks });
      } catch {
        if (!cancelled) setLoad({ status: "error", message: "Could not load this page." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (load.status !== "ready" || submitting) return;
    setErrMsg(null);
    setDoneMsg(null);
    const updates = load.tasks.map((t) => ({
      task_id: t.id,
      status: byId[t.id]?.status ?? "in_progress",
      note: (byId[t.id]?.note ?? "").trim() || undefined,
    }));
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/assignee-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, updates }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setErrMsg(typeof j?.error === "string" ? j.error : "Something went wrong.");
        return;
      }
      setDoneMsg("Thanks — your update was saved.");
    } catch {
      setErrMsg("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (load.status === "loading") {
    return (
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-4 py-16">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (load.status === "error") {
    return (
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-4 py-16">
        <h1 className="text-lg font-semibold text-foreground">Update unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{load.message}</p>
      </div>
    );
  }

  if (load.tasks.length === 0) {
    return (
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-4 py-16">
        <h1 className="text-lg font-semibold text-foreground">Nothing to update</h1>
        <p className="mt-2 text-sm text-muted-foreground">There are no open tasks on this link.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-full max-w-lg px-4 py-10">
      <h1 className="text-xl font-semibold text-foreground">Task update</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{load.assignee_email}</span>. Set status and add a
        short note if you like.
      </p>

      {doneMsg ? (
        <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
          {doneMsg}
        </div>
      ) : null}
      {errMsg ? (
        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-900 dark:text-red-100">
          {errMsg}
        </div>
      ) : null}

      <form className="mt-6 space-y-6" onSubmit={(e) => void onSubmit(e)}>
        {load.tasks.map((t) => (
          <div key={t.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="text-sm font-medium text-foreground">{t.title}</div>
            <label className="mt-3 block text-xs font-medium text-muted-foreground" htmlFor={`st-${t.id}`}>
              Status
            </label>
            <select
              id={`st-${t.id}`}
              className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={byId[t.id]?.status ?? "in_progress"}
              onChange={(e) =>
                setById((prev) => ({
                  ...prev,
                  [t.id]: {
                    status: e.target.value as PerTask["status"],
                    note: prev[t.id]?.note ?? "",
                  },
                }))
              }
            >
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
            </select>
            <label className="mt-3 block text-xs font-medium text-muted-foreground" htmlFor={`n-${t.id}`}>
              Note (optional)
            </label>
            <textarea
              id={`n-${t.id}`}
              className="mt-1 min-h-[88px] w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={byId[t.id]?.note ?? ""}
              onChange={(e) =>
                setById((prev) => ({
                  ...prev,
                  [t.id]: { status: prev[t.id]?.status ?? "in_progress", note: e.target.value },
                }))
              }
              maxLength={4000}
            />
          </div>
        ))}

        <button
          type="submit"
          disabled={submitting || !!doneMsg}
          className="h-11 w-full rounded-lg bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Submit update"}
        </button>
      </form>

      <p className="mt-6 text-[11px] text-muted-foreground">
        Link valid until {new Date(load.expires_at).toLocaleString()}. You can also reply to the original email.
      </p>
    </div>
  );
}
