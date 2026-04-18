"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { calendarYmdInTimeZone } from "@/lib/email/calendarYmd";
import { useTaskStore, type Task } from "@/store/taskStore";
import { useUserStore } from "@/store/userStore";

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

function formatInvalidBodyDetails(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  const d = details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
  const bits: string[] = [];
  for (const e of d.formErrors ?? []) {
    if (e) bits.push(e);
  }
  for (const [field, errs] of Object.entries(d.fieldErrors ?? {})) {
    if (Array.isArray(errs) && errs.length) bits.push(`${field}: ${errs.join(", ")}`);
  }
  return bits.length ? bits.join(" · ") : "";
}

function formatTaskMeta(t: Task): string {
  const assignee = (t.assigned_to ?? "").trim();
  const assigneeBit =
    assignee && assignee.toLowerCase() !== "self" ? assignee : assignee === "" ? "Unassigned" : null;
  const due = [t.due_date, t.due_time].filter(Boolean).join(" ");
  const bits = [assigneeBit, t.type, due].filter(Boolean);
  return bits.join(" · ");
}

/** Automate Followups: show others or unassigned; hide tasks explicitly assigned to self. */
function includeInAutomateFollowups(t: Task): boolean {
  const a = (t.assigned_to ?? "").trim();
  if (a.toLowerCase() === "self") return false;
  return true;
}

/** From the next local calendar day after a successful send, hide from this hub list. */
function hideFromAutomateHubAfterPriorSendDay(t: Task, timezone: string | null | undefined): boolean {
  const s = t.automate_followup_sent_at;
  if (!s) return false;
  const sentYmd = calendarYmdInTimeZone(timezone, new Date(s));
  const todayYmd = calendarYmdInTimeZone(timezone, new Date());
  return sentYmd < todayYmd;
}

function assigneeSortKey(t: Task): string {
  const a = (t.assigned_to ?? "").trim();
  if (a === "") return "\uffff";
  return a.toLowerCase();
}

export function AutomateFollowups() {
  const tasks = useTaskStore((s) => s.tasks);
  const addTasks = useTaskStore((s) => s.addTasks);
  const profileTimezone = useUserStore((s) => s.profile?.timezone);

  const followupTasks = React.useMemo(() => {
    const open = tasks
      .filter((t) => t.status === "pending")
      .filter(includeInAutomateFollowups)
      .filter((t) => !hideFromAutomateHubAfterPriorSendDay(t, profileTimezone));
    return [...open].sort((a, b) => {
      const ak = assigneeSortKey(a);
      const bk = assigneeSortKey(b);
      if (ak !== bk) return ak.localeCompare(bk);
      return a.title.localeCompare(b.title);
    });
  }, [tasks, profileTimezone]);

  const [open, setOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const [defaultChannel, setDefaultChannel] = React.useState<Channel>("email");
  const [channel, setChannel] = React.useState<Channel>("email");
  const [googleAccounts, setGoogleAccounts] = React.useState<ConnectedAccount[]>([]);
  const [fromAccountId, setFromAccountId] = React.useState<string>("");
  const [toRaw, setToRaw] = React.useState("");
  const [ccRaw, setCcRaw] = React.useState("");
  const [message, setMessage] = React.useState("");

  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const [assignOpenId, setAssignOpenId] = React.useState<string | null>(null);
  const [assignDraft, setAssignDraft] = React.useState("");
  const [assignSavingId, setAssignSavingId] = React.useState<string | null>(null);

  const saveAssignee = async (taskId: string) => {
    const v = assignDraft.trim();
    if (!v) return;
    setAssignSavingId(taskId);
    setErr(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ assigned_to: v }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Assign failed");
      if (j?.task) addTasks([j.task as Task]);
      setAssignOpenId(null);
      setAssignDraft("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setAssignSavingId(null);
    }
  };

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
    const initial = new Set(followupTasks.map((t) => t.id));
    if (taskId) initial.add(taskId);
    setSelectedIds(initial);
    setChannel(defaultChannel);
    if (!fromAccountId && googleAccounts.length > 0) setFromAccountId(googleAccounts[0]!.id);
    setToRaw("");
    setCcRaw("");
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
      const selectedList = followupTasks.filter((t) => selectedIds.has(t.id));
      if (selectedList.length === 0) throw new Error("Select at least one task.");
      if (selectedList.some((t) => t.id.startsWith("temp_"))) {
        throw new Error("Some selected tasks are still saving. Wait a moment and try again.");
      }
      if (!message.trim()) throw new Error("Write a short update message.");

      if (channel !== "email") {
        throw new Error("Only Email is supported for automated follow-ups right now.");
      }
      if (!fromAccountId) throw new Error("Pick a connected Email account (Google) to send from.");
      const toEmails = parseRecipients(toRaw).filter(isEmail);
      if (toEmails.length !== 1) {
        throw new Error("Enter exactly one email in To (the person who can use the update link).");
      }
      const ccTokens = parseRecipients(ccRaw);
      for (const t of ccTokens) {
        if (!isEmail(t)) throw new Error(`Cc has an invalid email: ${t.slice(0, 64)}`);
      }

      const task_ids = selectedList.map((t) => t.id);

      const res = await fetch("/api/followups/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          channel: "email",
          from_connected_account_id: fromAccountId,
          message: message.trim(),
          task_ids,
          to_raw: toRaw.trim(),
          cc_raw: ccRaw.trim(),
        }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        details?: string | Record<string, unknown>;
        results?: Array<{ to: string; ok: boolean; error?: string }>;
        updated_tasks?: Task[];
      } | null;

      if (!res.ok) {
        const base = typeof j?.error === "string" ? j.error : "Could not send followup.";
        const det =
          typeof j?.details === "string"
            ? j.details
            : j?.error === "Invalid body"
              ? formatInvalidBodyDetails(j.details)
              : "";
        throw new Error(det ? `${base}: ${det}` : base);
      }

      const results = Array.isArray(j?.results) ? j.results : [];
      if (j?.ok) {
        setNotice(`Sent ${results.filter((r) => r.ok).length} message(s).`);
        if (Array.isArray(j.updated_tasks) && j.updated_tasks.length > 0) {
          addTasks(j.updated_tasks);
        }
        window.dispatchEvent(new CustomEvent("bacup:automate-followup-sent"));
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

  return (
    <div className="mt-4 rounded-xl border border-border/60 bg-background/60 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Automate Followups</h3>
        <span className="text-[10px] tabular-nums text-muted-foreground">{followupTasks.length} open</span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Open tasks sorted by assignee (self-assigned items are hidden). One email lists every selected task; set To and Cc
        once. Tasks you already emailed stay here until the next calendar day, then move to history below.
      </p>

      {notice ? <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{notice}</p> : null}
      {followupTasks.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Nothing to follow up here yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {followupTasks.map((t) => (
            <li
              key={t.id}
              className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-foreground">{t.title}</div>
                <div className="truncate text-[10px] text-muted-foreground">{formatTaskMeta(t)}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {String(t.assigned_to ?? "").trim() === "" ? (
                  assignOpenId === t.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        className="h-8 w-[min(240px,60vw)] rounded-md border border-border bg-background px-2 text-xs"
                        value={assignDraft}
                        onChange={(e) => setAssignDraft(e.target.value)}
                        placeholder="Assignee (email or name)"
                        disabled={assignSavingId === t.id}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void saveAssignee(t.id)}
                        disabled={assignSavingId === t.id || !assignDraft.trim()}
                      >
                        {assignSavingId === t.id ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="border border-border/60"
                        onClick={() => {
                          setAssignOpenId(null);
                          setAssignDraft("");
                        }}
                        disabled={assignSavingId === t.id}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="border border-border/60"
                      onClick={() => {
                        setAssignOpenId(t.id);
                        setAssignDraft("");
                      }}
                    >
                      Assign
                    </Button>
                  )
                ) : null}
                <Button type="button" size="sm" onClick={() => openModalForTask(t.id)}>
                  Follow up
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))]">
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 bg-black/40"
            onClick={() => (saving ? null : setOpen(false))}
          />
          <div className="relative z-10 flex max-h-[min(90dvh,calc(100dvh-2rem))] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Follow up</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Choose tasks, one To address, optional Cc. One message lists every selected task. Tone comes from your
                  template in Settings → Communications.
                </div>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                Close
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
              {err ? (
                <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/[0.08] px-3 py-2 text-xs text-red-800 dark:text-red-200">
                  {err}
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
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
                  {followupTasks.map((t) => {
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

              {channel === "email" ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">To</div>
                    <input
                      className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={toRaw}
                      onChange={(e) => setToRaw(e.target.value)}
                      placeholder="assignee@company.com"
                      disabled={saving}
                      autoComplete="email"
                    />
                    <p className="text-[11px] text-muted-foreground">Exactly one email (gets the no-login update link).</p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cc</div>
                    <input
                      className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={ccRaw}
                      onChange={(e) => setCcRaw(e.target.value)}
                      placeholder="optional@company.com, …"
                      disabled={saving}
                      autoComplete="email"
                    />
                    <p className="text-[11px] text-muted-foreground">Optional; comma or newline separated.</p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">Switch to Email to send from a connected Google account.</p>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/60 bg-background px-4 py-3">
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
