"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { useSettingsModal } from "@/modules/settings/SettingsProvider";
import type { ConnectedAccountRow } from "@/modules/settings/types";

type FollowSettings = {
  automation_enabled: boolean;
  reply_parse_enabled: boolean;
  send_mode: "manual_review" | "auto_send";
  max_nudges_per_day: number;
  max_nudges_per_task: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  default_response_hours: number;
  reminder_interval_minutes: number;
  from_connected_account_id: string | null;
};

type LogRow = {
  id: string;
  to_email: string;
  subject: string;
  body_plain: string;
  status: string;
  created_at: string;
};

type ReplyEventRow = {
  id: string;
  intent: string;
  raw_text: string;
  from_email_preview: string | null;
  created_at: string;
  undone_at: string | null;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-foreground">{label}</div>
      {children}
    </div>
  );
}

export function FollowAutomationTab({ googleAccounts }: { googleAccounts: ConnectedAccountRow[] }) {
  const { openSettingsToTab } = useSettingsModal();
  const [settings, setSettings] = React.useState<FollowSettings | null>(null);
  const [pending, setPending] = React.useState<LogRow[]>([]);
  const [replyEvents, setReplyEvents] = React.useState<ReplyEventRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [sRes, pRes, rRes] = await Promise.all([
        fetch("/api/workspace/follow-settings", { credentials: "include" }),
        fetch("/api/workspace/follow-log?status=pending_approval&limit=20", { credentials: "include" }),
        fetch("/api/workspace/follow-replies?limit=25", { credentials: "include" }),
      ]);
      const sj = await sRes.json().catch(() => null);
      const pj = await pRes.json().catch(() => null);
      const rj = await rRes.json().catch(() => null);
      if (!sRes.ok) throw new Error(typeof sj?.error === "string" ? sj.error : "Failed to load settings");
      setSettings(sj?.settings as FollowSettings);
      setPending(Array.isArray(pj?.log) ? (pj.log as LogRow[]) : []);
      setReplyEvents(Array.isArray(rj?.events) ? (rj.events as ReplyEventRow[]) : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: Partial<FollowSettings>) => {
    if (!settings) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/workspace/follow-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...settings, ...patch }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Save failed");
      setSettings(j?.settings as FollowSettings);
      setMsg("Saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const approve = async (id: string) => {
    setErr(null);
    try {
      const res = await fetch(`/api/workspace/follow-outbound/${id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Approve failed");
      void load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Approve failed");
    }
  };

  const undoReply = async (id: string) => {
    setErr(null);
    try {
      const res = await fetch(`/api/workspace/follow-replies/${id}/undo`, {
        method: "POST",
        credentials: "include",
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Undo failed");
      void load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Undo failed");
    }
  };

  const cancel = async (id: string) => {
    setErr(null);
    try {
      const res = await fetch(`/api/workspace/follow-outbound/${id}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(typeof j?.error === "string" ? j.error : "Cancel failed");
      }
      void load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Cancel failed");
    }
  };

  if (loading || !settings) {
    return <p className="text-sm text-muted-foreground">Loading follow automation…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Phase C: Bacup can chase status on enrolled tasks by email (Google send). Default is{" "}
          <strong className="font-medium text-foreground">draft → your approval</strong> before anything sends. Use
          auto-send only with caps and quiet hours you trust.
        </p>
        {googleAccounts.length === 0 ? (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
            Connect a Google account with send permission to enable outbound nudges.{" "}
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={() => openSettingsToTab("integrations")}
            >
              Open Integrations
            </button>
          </p>
        ) : null}
      </div>

      {err ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/[0.08] px-3 py-2 text-xs text-red-800 dark:text-red-200">
          {err}
        </div>
      ) : null}
      {msg ? (
        <div className="rounded-md border border-emerald-600/40 bg-emerald-500/[0.1] px-3 py-2 text-xs text-emerald-900 dark:text-emerald-100">
          {msg}
        </div>
      ) : null}

      <Field label="Automation master switch">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.automation_enabled}
            disabled={saving}
            onChange={(e) => void save({ automation_enabled: e.target.checked })}
          />
          Allow Bacup to run follow-up jobs on enrolled tasks (cron checks every ~10 minutes)
        </label>
      </Field>

      <Field label="Reply parsing (Phase D)">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.reply_parse_enabled !== false}
            disabled={saving}
            onChange={(e) => void save({ reply_parse_enabled: e.target.checked })}
          />
          Parse assignee replies in Gmail threads (rule-based: done / reassigned / in progress). Cron ~15 min.
        </label>
      </Field>

      <Field label="Send mode">
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="send_mode"
              checked={settings.send_mode === "manual_review"}
              disabled={saving}
              onChange={() => void save({ send_mode: "manual_review" })}
            />
            Manual review — queue drafts; you approve each send
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="send_mode"
              checked={settings.send_mode === "auto_send"}
              disabled={saving}
              onChange={() => void save({ send_mode: "auto_send" })}
            />
            Auto-send within rules (quiet hours + daily cap + per-task cap)
          </label>
        </div>
      </Field>

      <Field label="Send from (Google)">
        <select
          className="h-10 w-full max-w-md rounded-md border border-foreground/10 bg-background px-3 text-sm"
          value={settings.from_connected_account_id ?? ""}
          disabled={saving}
          onChange={(e) =>
            void save({
              from_connected_account_id: e.target.value ? e.target.value : null,
            })
          }
        >
          <option value="">Select account…</option>
          {googleAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.account_email}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Max nudges / day (all tasks)">
          <input
            type="number"
            className="h-10 w-full rounded-md border border-foreground/10 bg-background px-3 text-sm"
            min={1}
            max={500}
            value={settings.max_nudges_per_day}
            disabled={saving}
            onChange={(e) => setSettings({ ...settings, max_nudges_per_day: Number(e.target.value) })}
            onBlur={() => void save({ max_nudges_per_day: settings.max_nudges_per_day })}
          />
        </Field>
        <Field label="Max nudges / task (lifetime of enrollment)">
          <input
            type="number"
            className="h-10 w-full rounded-md border border-foreground/10 bg-background px-3 text-sm"
            min={1}
            max={100}
            value={settings.max_nudges_per_task}
            disabled={saving}
            onChange={(e) => setSettings({ ...settings, max_nudges_per_task: Number(e.target.value) })}
            onBlur={() => void save({ max_nudges_per_task: settings.max_nudges_per_task })}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Default “expect reply by” window (hours, new enrollments)">
          <input
            type="number"
            className="h-10 w-full rounded-md border border-foreground/10 bg-background px-3 text-sm"
            min={0.25}
            step={0.25}
            value={settings.default_response_hours}
            disabled={saving}
            onChange={(e) => setSettings({ ...settings, default_response_hours: Number(e.target.value) })}
            onBlur={() => void save({ default_response_hours: settings.default_response_hours })}
          />
        </Field>
        <Field label="Reminder interval (minutes)">
          <input
            type="number"
            className="h-10 w-full rounded-md border border-foreground/10 bg-background px-3 text-sm"
            min={5}
            value={settings.reminder_interval_minutes}
            disabled={saving}
            onChange={(e) => setSettings({ ...settings, reminder_interval_minutes: Number(e.target.value) })}
            onBlur={() => void save({ reminder_interval_minutes: settings.reminder_interval_minutes })}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quiet hours start (optional, 24h local)">
          <input
            type="text"
            className="h-10 w-full rounded-md border border-foreground/10 bg-background px-3 text-sm"
            placeholder="22:00"
            value={settings.quiet_hours_start ?? ""}
            disabled={saving}
            onChange={(e) => setSettings({ ...settings, quiet_hours_start: e.target.value || null })}
            onBlur={() =>
              void save({
                quiet_hours_start: settings.quiet_hours_start?.match(/^\d{2}:\d{2}$/)
                  ? settings.quiet_hours_start
                  : null,
              })
            }
          />
        </Field>
        <Field label="Quiet hours end (optional)">
          <input
            type="text"
            className="h-10 w-full rounded-md border border-foreground/10 bg-background px-3 text-sm"
            placeholder="07:00"
            value={settings.quiet_hours_end ?? ""}
            disabled={saving}
            onChange={(e) => setSettings({ ...settings, quiet_hours_end: e.target.value || null })}
            onBlur={() =>
              void save({
                quiet_hours_end: settings.quiet_hours_end?.match(/^\d{2}:\d{2}$/) ? settings.quiet_hours_end : null,
              })
            }
          />
        </Field>
      </div>

      <div className="space-y-2 border-t border-border/60 pt-4">
        <div className="text-sm font-semibold text-foreground">Pending approval</div>
        {pending.length === 0 ? (
          <p className="text-xs text-muted-foreground">No queued sends.</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((p) => (
              <li key={p.id} className="rounded-lg border border-border/70 bg-background/80 p-3 text-xs">
                <div className="font-medium text-foreground">{p.subject}</div>
                <div className="mt-1 text-muted-foreground">To: {p.to_email}</div>
                <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap font-sans text-[11px] text-foreground">
                  {p.body_plain}
                </pre>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => void approve(p.id)}>
                    Approve &amp; send
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => void cancel(p.id)}>
                    Cancel
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-border/60 pt-4">
        <div className="text-sm font-semibold text-foreground">Recent parsed replies</div>
        {replyEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground">No parsed replies yet.</p>
        ) : (
          <ul className="space-y-2">
            {replyEvents.map((ev) => (
              <li key={ev.id} className="rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{ev.intent}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(ev.created_at).toLocaleString()}
                    {ev.undone_at ? " · undone" : ""}
                  </span>
                </div>
                {ev.from_email_preview ? (
                  <div className="mt-1 text-[10px] text-muted-foreground">From: {ev.from_email_preview}</div>
                ) : null}
                <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-sans text-[11px] text-foreground">
                  {ev.raw_text.slice(0, 600)}
                  {ev.raw_text.length > 600 ? "…" : ""}
                </pre>
                {!ev.undone_at && ev.intent !== "noop" ? (
                  <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => void undoReply(ev.id)}>
                    Undo task change
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Audit: every outbound is logged (sent, skipped, failed). Parsed replies are stored here; undo restores the
        prior task snapshot. WhatsApp is a later phase.
      </p>
    </div>
  );
}
