"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { useTaskStore, type Task } from "@/store/taskStore";

type Channel = "email" | "whatsapp" | "slack";

type ConnectedAccount = {
  id: string;
  provider: "google" | "microsoft" | "imap";
  account_email: string;
  display_name?: string | null;
};

function parseRecipients(raw: string): string[] {
  return raw
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function formatTaskMeta(t: Task): string {
  const due = [t.due_date, t.due_time].filter(Boolean).join(" ");
  const bits = [t.type, due].filter(Boolean);
  return bits.join(" · ");
}

export function AutomateFollowups() {
  const tasks = useTaskStore((s) => s.tasks);
  const openTasks = React.useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);

  const [open, setOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const [defaultChannel, setDefaultChannel] = React.useState<Channel>("email");
  const [channel, setChannel] = React.useState<Channel>("email");
  const [googleAccounts, setGoogleAccounts] = React.useState<ConnectedAccount[]>([]);
  const [fromAccountId, setFromAccountId] = React.useState<string>("");
  const [recipientByTaskId, setRecipientByTaskId] = React.useState<Record<string, string>>({});
  const [message, setMessage] = React.useState("");

  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/user/settings", { cache: "no-store", credentials: "include" });
        const j = (await res.json().catch(() => null)) as {
          settings?: { followup_communication_channel?: unknown };
          connectedAccounts?: ConnectedAccount[];
        };
        const raw = j?.settings?.followup_communication_channel;
        const next: Channel = raw === "whatsapp" || raw === "slack" ? raw : "email";
        if (cancelled) return;
        setDefaultChannel(next);
        setChannel(next);

        const connected = Array.isArray(j?.connectedAccounts) ? j.connectedAccounts : [];
        const g = connected.filter((a) => a && a.provider === "google" && typeof a.id === "string") as ConnectedAccount[];
        setGoogleAccounts(g);
        if (!fromAccountId && g.length > 0) setFromAccountId(g[0]!.id);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openModalForTask = (taskId: string) => {
    const initial = new Set(openTasks.map((t) => t.id));
    if (taskId) initial.add(taskId);
    setSelectedIds(initial);
    setChannel(defaultChannel);
    if (!fromAccountId && googleAccounts.length > 0) setFromAccountId(googleAccounts[0]!.id);
    const blankRecipients: Record<string, string> = {};
    for (const t of openTasks) blankRecipients[t.id] = "";
    setRecipientByTaskId(blankRecipients);
    setMessage("");
    setErr(null);
    setNotice(null);
    setOpen(true);
  };

  const submit = async () => {
    setSaving(true);
    setErr(null);
    setNotice(null);
    try {
      const selectedList = openTasks.filter((t) => selectedIds.has(t.id));
      if (selectedList.length === 0) throw new Error("Select at least one task.");
      if (!message.trim()) throw new Error("Write a short update message.");

      if (channel === "email") {
        if (!fromAccountId) throw new Error("Pick a connected Email account (Google) to send from.");
        for (const t of selectedList) {
          const emails = parseRecipients(recipientByTaskId[t.id] ?? "").filter(isEmail);
          if (emails.length === 0) {
            throw new Error(`Add at least one email for: ${t.title}`);
          }
        }
      } else {
        for (const t of selectedList) {
          if (!parseRecipients(recipientByTaskId[t.id] ?? "").length) {
            throw new Error(`Add at least one recipient identifier for: ${t.title}`);
          }
        }
      }

      const task_assignments = selectedList.map((t) => ({
        task_id: t.id,
        recipients_raw: recipientByTaskId[t.id] ?? "",
      }));

      const task_summaries = selectedList.map((t) => ({ id: t.id, title: t.title }));

      const res = await fetch("/api/followups/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          channel,
          ...(channel === "email" ? { from_connected_account_id: fromAccountId } : {}),
          message: message.trim(),
          task_summaries,
          task_assignments,
        }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        details?: string;
        results?: Array<{ to: string; ok: boolean; error?: string }>;
      } | null;

      if (!res.ok) {
        const base = typeof j?.error === "string" ? j.error : "Could not send followup.";
        const det = typeof j?.details === "string" ? j.details : "";
        throw new Error(det ? `${base}: ${det}` : base);
      }

      const results = Array.isArray(j?.results) ? j.results : [];
      if (j?.ok) {
        setNotice(`Sent ${results.filter((r) => r.ok).length} consolidated message(s).`);
        setOpen(false);
        return;
      }

      const failed = results.filter((r) => !r.ok);
      const okN = results.filter((r) => r.ok).length;
      if (failed.length === results.length) {
        setErr(failed.map((f) => `${f.to}: ${f.error ?? "failed"}`).join("; "));
        return;
      }
      setNotice(`Sent ${okN} of ${results.length} recipient(s).`);
      setErr(`Some sends failed: ${failed.map((f) => `${f.to}: ${f.error ?? "failed"}`).join("; ")}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send followup.");
    } finally {
      setSaving(false);
    }
  };

  const selectedTasks = openTasks.filter((t) => selectedIds.has(t.id));

  return (
    <div className="mt-4 rounded-xl border border-border/60 bg-background/60 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Automate Followups</h3>
        <span className="text-[10px] tabular-nums text-muted-foreground">{openTasks.length} open</span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        All open tasks. Recipients are grouped automatically: one message per person with every task they owe you an
        update on.
      </p>

      {notice ? <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{notice}</p> : null}
      {openTasks.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Nothing open.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {openTasks.map((t) => (
            <li
              key={t.id}
              className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-foreground">{t.title}</div>
                <div className="truncate text-[10px] text-muted-foreground">{formatTaskMeta(t)}</div>
              </div>
              <Button type="button" size="sm" onClick={() => openModalForTask(t.id)}>
                Follow up
              </Button>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            onClick={() => (saving ? null : setOpen(false))}
          />
          <div className="relative z-10 w-full max-w-[720px] rounded-2xl border border-border bg-background p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Follow up</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Pick tasks, assign recipients per task — we consolidate so each person gets one message with all their
                  items. Tone comes from your template in Settings → Communications.
                </div>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                Close
              </Button>
            </div>

            {err ? (
              <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/[0.08] px-3 py-2 text-xs text-red-800 dark:text-red-200">
                {err}
              </div>
            ) : null}

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Communication channel
                </div>
                <select
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as Channel)}
                >
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="slack">Slack</option>
                </select>
                <div className="text-[11px] text-muted-foreground">
                  Default from Settings: <span className="font-medium">{defaultChannel}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Your note</div>
                <p className="text-[11px] text-muted-foreground">
                  This becomes <span className="font-mono text-[10px]">{"{{user_message}}"}</span> inside your email
                  template.
                </p>
              </div>
            </div>

            {channel === "email" ? (
              <div className="mt-3 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Send from</div>
                <select
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  value={fromAccountId}
                  onChange={(e) => setFromAccountId(e.target.value)}
                  disabled={saving}
                >
                  <option value="" disabled>
                    {googleAccounts.length ? "Select account…" : "No Google account connected"}
                  </option>
                  {googleAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.display_name && a.display_name.trim()) || a.account_email}
                    </option>
                  ))}
                </select>
                {!googleAccounts.length ? (
                  <div className="text-[11px] text-muted-foreground">
                    Connect a Google account in <span className="font-medium">Settings → Integrations</span>.
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-3 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Message</div>
              <textarea
                className="min-h-[88px] w-full resize-y rounded-md border border-border bg-background px-2 py-2 text-sm"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ask for an update, add context, and propose next step…"
              />
            </div>

            <div className="mt-3 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Pending tasks to follow up on
              </div>
              <div className="max-h-40 overflow-y-auto rounded-md border border-border/60 bg-muted/10 p-2">
                {openTasks.map((t) => {
                  const checked = selectedIds.has(t.id);
                  return (
                    <label key={t.id} className="flex cursor-pointer items-start gap-2 py-1 text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(t.id);
                            else next.delete(t.id);
                            return next;
                          });
                          if (e.target.checked) {
                            setRecipientByTaskId((prev) => ({ ...prev, [t.id]: prev[t.id] ?? "" }));
                          }
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">{t.title}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">{formatTaskMeta(t)}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Recipients per selected task
              </div>
              <p className="text-[11px] text-muted-foreground">
                {channel === "email"
                  ? "One or more emails per task (comma-separated). The same person on multiple tasks gets a single consolidated email."
                  : "WhatsApp and Slack sending is coming next — identifiers are collected for when those channels ship."}
              </p>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border/60 bg-muted/10 p-2">
                {selectedTasks.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Select at least one task above.</div>
                ) : (
                  selectedTasks.map((t) => (
                    <div key={t.id} className="space-y-1 rounded-md border border-border/50 bg-background/70 px-2 py-2">
                      <div className="truncate text-xs font-medium text-foreground">{t.title}</div>
                      <input
                        className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                        value={recipientByTaskId[t.id] ?? ""}
                        onChange={(e) => setRecipientByTaskId((prev) => ({ ...prev, [t.id]: e.target.value }))}
                        placeholder={channel === "email" ? "email@company.com, …" : "phone / channel id (soon)"}
                        disabled={saving}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="ghost" disabled={saving} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={saving || (channel === "email" && googleAccounts.length === 0)}
                onClick={() => void submit()}
              >
                {saving ? "Sending…" : "Send followup"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
