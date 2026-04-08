"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { ConnectedAccountRow } from "@/modules/settings/types";

type GmailRow = {
  id: string;
  threadId?: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  error?: boolean;
  source: "google" | "imap";
  accountEmail: string;
};

type CalendarRow = {
  id: string;
  summary: string;
  htmlLink: string | null;
  location: string | null;
  start: string | null;
  end: string | null;
  source: "google" | "imap";
  accountEmail: string;
};

function ymdLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function messageLocalYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function calWindowParams() {
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return { timeMin, timeMax };
}

export function GoogleWorkspaceView() {
  const [mailLoading, setMailLoading] = useState(true);
  const [calLoading, setCalLoading] = useState(true);
  const [mailErr, setMailErr] = useState<string | null>(null);
  const [calErr, setCalErr] = useState<string | null>(null);
  const [messages, setMessages] = useState<GmailRow[]>([]);
  const [events, setEvents] = useState<CalendarRow[]>([]);

  const load = useCallback(async () => {
    setMailLoading(true);
    setCalLoading(true);
    setMailErr(null);
    setCalErr(null);

    const accRes = await fetch("/api/user/connected-accounts", { credentials: "include" });
    const accJson = (await accRes.json().catch(() => null)) as { accounts?: ConnectedAccountRow[] } | null;
    const accounts = accRes.ok && Array.isArray(accJson?.accounts) ? accJson!.accounts! : [];

    const googleIds = accounts.filter((a) => a.provider === "google").map((a) => a.id);
    const imapList = accounts.filter((a) => a.provider === "imap");
    const day = ymdLocal();
    const { timeMin, timeMax } = calWindowParams();

    const mergedMail: GmailRow[] = [];
    const mergedCal: CalendarRow[] = [];

    if (googleIds.length === 0 && imapList.length === 0) {
      setMailErr("not_connected");
      setCalErr("not_connected");
      setMessages([]);
      setEvents([]);
      setMailLoading(false);
      setCalLoading(false);
      return;
    }

    let mailHadError = false;
    let calHadError = false;

    for (const gid of googleIds) {
      const mailQs = new URLSearchParams({ maxResults: "12", date: day, accountId: gid });
      const mailRes = await fetch(`/api/integrations/google/gmail?${mailQs}`, { credentials: "include" });
      const mailJson = (await mailRes.json().catch(() => null)) as Record<string, unknown> | null;
      const accEmail = accounts.find((a) => a.id === gid)?.account_email ?? "";
      if (!mailRes.ok) {
        if (mailRes.status !== 404) mailHadError = true;
        continue;
      }
      const list = Array.isArray(mailJson?.messages) ? (mailJson!.messages as Omit<GmailRow, "source" | "accountEmail">[]) : [];
      for (const m of list) {
        mergedMail.push({
          ...m,
          source: "google",
          accountEmail: accEmail,
        });
      }
    }

    for (const acc of imapList) {
      const q = new URLSearchParams({ accountId: acc.id, maxResults: "80" });
      const mailRes = await fetch(`/api/integrations/imap/messages?${q}`, { credentials: "include" });
      const mailJson = (await mailRes.json().catch(() => null)) as Record<string, unknown> | null;
      if (!mailRes.ok) {
        mailHadError = true;
        continue;
      }
      const raw = Array.isArray(mailJson?.messages) ? mailJson!.messages : [];
      for (const m of raw as { id: string; subject: string; from: string; date: string; snippet: string; accountEmail?: string }[]) {
        if (messageLocalYmd(m.date) !== day) continue;
        mergedMail.push({
          id: `imap:${acc.id}:${m.id}`,
          subject: m.subject,
          from: m.from,
          date: m.date,
          snippet: m.snippet ?? "",
          source: "imap",
          accountEmail: m.accountEmail || acc.account_email,
        });
      }
    }

    mergedMail.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (mergedMail.length === 0 && mailHadError) {
      setMailErr("Could not load mail from one or more accounts.");
    } else {
      setMailErr(null);
    }
    setMessages(mergedMail);
    setMailLoading(false);

    for (const gid of googleIds) {
      const calQs = new URLSearchParams({
        maxResults: "25",
        accountId: gid,
        timeMin,
        timeMax,
      });
      const calRes = await fetch(`/api/integrations/google/calendar-events?${calQs}`, { credentials: "include" });
      const calJson = (await calRes.json().catch(() => null)) as Record<string, unknown> | null;
      const accEmail = accounts.find((a) => a.id === gid)?.account_email ?? "";
      if (!calRes.ok) {
        if (calRes.status !== 404) calHadError = true;
        continue;
      }
      const list = Array.isArray(calJson?.events)
        ? (calJson!.events as Omit<CalendarRow, "source" | "accountEmail">[])
        : [];
      for (const ev of list) {
        mergedCal.push({
          ...ev,
          source: "google",
          accountEmail: accEmail,
        });
      }
    }

    for (const acc of imapList) {
      const calQs = new URLSearchParams({
        accountId: acc.id,
        maxResults: "40",
        timeMin,
        timeMax,
      });
      const calRes = await fetch(`/api/integrations/imap/calendar-events?${calQs}`, { credentials: "include" });
      const calJson = (await calRes.json().catch(() => null)) as Record<string, unknown> | null;
      if (!calRes.ok) {
        calHadError = true;
        continue;
      }
      const list = Array.isArray(calJson?.events) ? (calJson!.events as CalendarRow[]) : [];
      for (const ev of list) {
        mergedCal.push({
          ...ev,
          source: "imap",
          accountEmail: ev.accountEmail || acc.account_email,
        });
      }
    }

    mergedCal.sort((a, b) => String(a.start ?? "").localeCompare(String(b.start ?? "")));
    if (mergedCal.length === 0 && calHadError) {
      setCalErr("Could not load calendar from one or more accounts.");
    } else {
      setCalErr(null);
    }
    setEvents(mergedCal);
    setCalLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const notConnected = mailErr === "not_connected" || calErr === "not_connected";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Mail &amp; calendar</h1>
          <p className="text-xs text-foreground/60">
            Gmail, Google Calendar, and connected IMAP / CalDAV accounts (read-only).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-foreground/5"
          >
            Refresh
          </button>
          <Link
            href="/api/integrations/google/start"
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
          >
            Connect Google
          </Link>
          <Link
            href="/settings"
            className="rounded-lg border border-border/80 px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5"
          >
            Settings
          </Link>
        </div>
      </header>

      {notConnected && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
          Connect Google (OAuth) or add an IMAP account under{" "}
          <strong>Settings → Integrations → Connect email</strong> to load mail and calendar here.
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <section className="flex min-h-[280px] flex-col rounded-xl border border-border/80 bg-muted/30 shadow-sm">
          <div className="border-b border-border/60 px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Inbox</h2>
            <p className="text-[10px] text-foreground/50">Today only (local date)</p>
            {mailLoading ? (
              <p className="text-xs text-foreground/50">Loading…</p>
            ) : mailErr && mailErr !== "not_connected" ? (
              <p className="text-xs text-red-600/90">{mailErr}</p>
            ) : null}
          </div>
          <ul className="max-h-[min(60vh,520px)] flex-1 divide-y divide-border/50 overflow-y-auto">
            {!mailLoading && messages.length === 0 && !mailErr ? (
              <li className="px-4 py-8 text-center text-xs text-foreground/50">No messages.</li>
            ) : null}
            {messages.map((m) => (
              <li key={m.id} className="px-4 py-3">
                {m.error ? (
                  <p className="text-xs text-foreground/50">Could not load message.</p>
                ) : (
                  <>
                    <p className="text-[10px] uppercase tracking-wide text-foreground/45">
                      {m.source === "google" ? "Google" : "IMAP"} · {m.accountEmail}
                    </p>
                    <p className="line-clamp-2 text-sm font-medium text-foreground">{m.subject}</p>
                    <p className="mt-0.5 text-[11px] text-foreground/55">{m.from}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-foreground/60">{m.snippet}</p>
                    {m.date ? (
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-foreground/40">
                        {m.date}
                      </p>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex min-h-[280px] flex-col rounded-xl border border-border/80 bg-muted/30 shadow-sm">
          <div className="border-b border-border/60 px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Calendar (7 days)</h2>
            {calLoading ? (
              <p className="text-xs text-foreground/50">Loading…</p>
            ) : calErr && calErr !== "not_connected" ? (
              <p className="text-xs text-red-600/90">{calErr}</p>
            ) : null}
          </div>
          <ul className="max-h-[min(60vh,520px)] flex-1 divide-y divide-border/50 overflow-y-auto">
            {!calLoading && events.length === 0 && !calErr ? (
              <li className="px-4 py-8 text-center text-xs text-foreground/50">No upcoming events.</li>
            ) : null}
            {events.map((ev) => (
              <li key={`${ev.source}:${ev.id}`} className="px-4 py-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-foreground/45">
                      {ev.source === "google" ? "Google" : "CalDAV"} · {ev.accountEmail}
                    </p>
                    <p className="text-sm font-medium text-foreground">{ev.summary}</p>
                    {ev.location ? (
                      <p className="text-[11px] text-foreground/55">{ev.location}</p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-[11px] text-foreground/50">{formatWhen(ev.start)}</p>
                </div>
                {ev.htmlLink ? (
                  <a
                    href={ev.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-[11px] font-medium text-blue-600 hover:underline"
                  >
                    Open in Google Calendar
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
