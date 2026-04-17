"use client";

import * as React from "react";

import { BodyPortal } from "@/components/portal/BodyPortal";
import { useSettingsModal } from "@/modules/settings/SettingsProvider";

const ICON_BTN =
  "inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted/70 text-foreground shadow-[0_1px_3px_rgba(61,45,33,0.08)] transition-[transform,background-color,opacity] hover:bg-foreground/5 active:scale-95";

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ymdToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Next top-of-hour and hour+1 for end (local). */
function defaultTimes(): { start: string; end: string } {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const startH = String(d.getHours()).padStart(2, "0");
  const endD = new Date(d.getTime() + 60 * 60 * 1000);
  const endH = String(endD.getHours()).padStart(2, "0");
  return { start: `${startH}:00`, end: `${endH}:00` };
}

function parseAttendeeLines(raw: string): string[] {
  const parts = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const emails: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p)) continue;
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    emails.push(p);
  }
  return emails.slice(0, 100);
}

export type TimelineCreateEventModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  connectedGoogle: boolean;
  connectedOutlook: boolean;
};

export function TimelineCreateEventModal({
  open,
  onClose,
  onCreated,
  connectedGoogle,
  connectedOutlook,
}: TimelineCreateEventModalProps) {
  const { openSettingsToTab } = useSettingsModal();
  const [provider, setProvider] = React.useState<"google" | "microsoft">("google");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [meetingLink, setMeetingLink] = React.useState("");
  const [startDate, setStartDate] = React.useState(ymdToday);
  const [startTime, setStartTime] = React.useState("10:00");
  const [endDate, setEndDate] = React.useState(ymdToday);
  const [endTime, setEndTime] = React.useState("11:00");
  const [timeZone, setTimeZone] = React.useState(() =>
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : "UTC",
  );
  const [attendeesRaw, setAttendeesRaw] = React.useState("");
  const [addVideoCall, setAddVideoCall] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setErr(null);
    setTitle("");
    setDescription("");
    setLocation("");
    setMeetingLink("");
    setAttendeesRaw("");
    setAddVideoCall(false);
    const t = defaultTimes();
    setStartDate(ymdToday());
    setEndDate(ymdToday());
    setStartTime(t.start);
    setEndTime(t.end);
    setTimeZone(typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : "UTC");
    if (connectedGoogle && !connectedOutlook) setProvider("google");
    else if (connectedOutlook && !connectedGoogle) setProvider("microsoft");
    else if (connectedGoogle) setProvider("google");
    else setProvider("google");
  }, [open, connectedGoogle, connectedOutlook]);

  if (!open) return null;

  const canConnect = connectedGoogle || connectedOutlook;

  const submit = async () => {
    setErr(null);
    const t = title.trim();
    if (!t) {
      setErr("Title is required.");
      return;
    }
    if (provider === "google" && !connectedGoogle) {
      setErr("Connect Google in Settings → Integrations.");
      return;
    }
    if (provider === "microsoft" && !connectedOutlook) {
      setErr("Connect Microsoft in Settings → Integrations.");
      return;
    }

    const attendees = parseAttendeeLines(attendeesRaw);
    const body = {
      title: t,
      description: description.trim() || null,
      location: location.trim() || null,
      meetingLink: meetingLink.trim() || null,
      startDate,
      startTime,
      endDate: endDate.trim() || null,
      endTime,
      timeZone: timeZone.trim() || "UTC",
      attendees: attendees.length ? attendees : undefined,
      addVideoCall: addVideoCall || undefined,
    };

    const url =
      provider === "google"
        ? "/api/integrations/google/calendar-events"
        : "/api/integrations/microsoft/calendar-events";

    setSaving(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!res.ok) {
        const msg =
          typeof j?.message === "string"
            ? j.message
            : typeof j?.error === "string"
              ? j.error
              : `Could not create event (${res.status})`;
        throw new Error(msg);
      }
      onCreated();
      onClose();
      setTitle("");
      setDescription("");
      setLocation("");
      setMeetingLink("");
      setAttendeesRaw("");
      setAddVideoCall(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create event");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-3">
        <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Dismiss" />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="timeline-create-event-title"
          className="relative z-10 flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-[0_12px_48px_rgba(0,0,0,0.2)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.55)]"
        >
          <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border/60 px-4 py-3">
            <div className="min-w-0">
              <div id="timeline-create-event-title" className="text-sm font-semibold text-foreground">
                New calendar event
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Creates the event on your {provider === "google" ? "Google" : "Microsoft 365"} calendar.
              </p>
            </div>
            <button type="button" className={ICON_BTN} aria-label="Close" onClick={onClose}>
              <IconClose />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {!canConnect ? (
              <div className="space-y-3 text-sm text-foreground">
                <p className="text-muted-foreground">
                  Connect Google or Microsoft in Settings to create events from the timeline.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openSettingsToTab("integrations");
                  }}
                  className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background hover:opacity-90"
                >
                  Open Integrations
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {connectedGoogle && connectedOutlook ? (
                  <label className="block">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Calendar</div>
                    <select
                      value={provider}
                      disabled={saving}
                      onChange={(e) => {
                        setProvider(e.target.value as "google" | "microsoft");
                        setAddVideoCall(false);
                      }}
                      className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-2 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                    >
                      <option value="google">Google Calendar</option>
                      <option value="microsoft">Microsoft Outlook</option>
                    </select>
                  </label>
                ) : null}

                <label className="block">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Title *</div>
                  <input
                    value={title}
                    disabled={saving}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-2 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                    placeholder="e.g. Product sync"
                  />
                </label>

                <label className="block">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Description</div>
                  <textarea
                    value={description}
                    disabled={saving}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="mt-1 w-full resize-y rounded-lg border border-border bg-muted/50 px-2 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                    placeholder="Notes, agenda, dial-in details…"
                  />
                </label>

                <label className="block">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Location</div>
                  <input
                    value={location}
                    disabled={saving}
                    onChange={(e) => setLocation(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-2 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                    placeholder="Room, address, or building"
                  />
                </label>

                <label className="block">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Meeting link (optional)
                  </div>
                  <input
                    value={meetingLink}
                    disabled={saving}
                    onChange={(e) => setMeetingLink(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-2 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                    placeholder="https://meet.google.com/… or Teams / Zoom URL"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Pasted into the event description. Use the checkbox below to auto-create a provider meeting.
                  </p>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Start date</div>
                    <input
                      type="date"
                      value={startDate}
                      disabled={saving}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-2 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                    />
                  </label>
                  <label className="block">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Start time</div>
                    <input
                      type="time"
                      value={startTime.length === 5 ? startTime : startTime.slice(0, 5)}
                      disabled={saving}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-2 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">End date</div>
                    <input
                      type="date"
                      value={endDate}
                      disabled={saving}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-2 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                    />
                  </label>
                  <label className="block">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">End time</div>
                    <input
                      type="time"
                      value={endTime.length === 5 ? endTime : endTime.slice(0, 5)}
                      disabled={saving}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-2 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                    />
                  </label>
                </div>

                <label className="block">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Time zone</div>
                  <input
                    value={timeZone}
                    disabled={saving}
                    onChange={(e) => setTimeZone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-2 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                    placeholder="e.g. America/Los_Angeles"
                  />
                </label>

                <label className="block">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Attendees</div>
                  <textarea
                    value={attendeesRaw}
                    disabled={saving}
                    onChange={(e) => setAttendeesRaw(e.target.value)}
                    rows={2}
                    className="mt-1 w-full resize-y rounded-lg border border-border bg-muted/50 px-2 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                    placeholder="email1@company.com, email2@company.com"
                  />
                </label>

                {provider === "google" && connectedGoogle ? (
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={addVideoCall}
                      disabled={saving}
                      onChange={(e) => setAddVideoCall(e.target.checked)}
                      className="rounded border-border"
                    />
                    Add Google Meet videoconferencing
                  </label>
                ) : null}

                {provider === "microsoft" && connectedOutlook ? (
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={addVideoCall}
                      disabled={saving}
                      onChange={(e) => setAddVideoCall(e.target.checked)}
                      className="rounded border-border"
                    />
                    Create as a Teams meeting (online)
                  </label>
                ) : null}

                {err ? <p className="text-[11px] text-red-700 dark:text-red-300">{err}</p> : null}

                <p className="text-[10px] text-muted-foreground">
                  If creation fails with “access” errors, reconnect {provider === "google" ? "Google" : "Microsoft"} in
                  Settings → Integrations (calendar permissions were updated).
                </p>
              </div>
            )}
          </div>

          {canConnect ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/60 px-4 py-3">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="rounded-full bg-muted px-4 py-2 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submit()}
                className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Create event"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </BodyPortal>
  );
}
