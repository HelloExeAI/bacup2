"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchMyTasks } from "@/lib/supabase/queries";
import { playNotificationSound } from "@/lib/notifications/notificationSounds";
import { isTaskOverdue, overdueAgingLabel, taskDueDateTime } from "@/lib/tasks/taskOverdue";
import type { Task } from "@/store/taskStore";
import { useNotificationScopeStore } from "@/store/notificationScopeStore";
import { useNotificationSoundStore } from "@/store/notificationSoundStore";
import { useTaskStore } from "@/store/taskStore";
import { useUserStore } from "@/store/userStore";

import { NotificationBellGraphic } from "@/components/notifications/NotificationBellGraphic";

const STORAGE_KEY_V2 = "bacup-notifications-read-v2";
/** Legacy ISO timestamp only — completions unread if completed after this. */
const STORAGE_KEY = "bacup-notifications-seen-at";
/** Previous cockpit-only key — read once so badge state isn’t reset for existing users. */
const LEGACY_STORAGE_KEY = "bacup-dashboard-completion-notifications-seen-at";
const DASHBOARD_VIEW_USER_STORAGE_KEY = "bacup-dashboard-view-user-id";

type ReadStateV2 = { seenAt: string; overdueIdsAtLastRead: string[] };

function readLegacySeenAt(): Date | null {
  if (typeof window === "undefined") return null;
  let best: Date | null = null;
  for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    const raw = localStorage.getItem(key);
    if (raw) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime()) && (!best || d.getTime() > best.getTime())) best = d;
    }
  }
  return best;
}

function defaultSeenAt(): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

function readReadState(): { seenAt: Date; overdueIdsAtLastRead: Set<string> } {
  if (typeof window === "undefined") {
    return { seenAt: new Date(0), overdueIdsAtLastRead: new Set() };
  }
  const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
  if (rawV2) {
    try {
      const j = JSON.parse(rawV2) as ReadStateV2;
      const seenAt = new Date(typeof j.seenAt === "string" ? j.seenAt : "");
      const ids = Array.isArray(j.overdueIdsAtLastRead)
        ? j.overdueIdsAtLastRead.filter((x) => typeof x === "string")
        : [];
      if (!Number.isNaN(seenAt.getTime())) {
        return { seenAt, overdueIdsAtLastRead: new Set(ids) };
      }
    } catch {
      /* fall through */
    }
  }
  const legacy = readLegacySeenAt();
  return {
    seenAt: legacy ?? defaultSeenAt(),
    overdueIdsAtLastRead: new Set(),
  };
}

function writeReadState(seenAt: Date, overdueIds: string[]) {
  const overdueIdsAtLastRead = [...new Set(overdueIds)].sort();
  localStorage.setItem(
    STORAGE_KEY_V2,
    JSON.stringify({
      seenAt: seenAt.toISOString(),
      overdueIdsAtLastRead,
    } satisfies ReadStateV2),
  );
  localStorage.setItem(STORAGE_KEY, seenAt.toISOString());
}

function formatWhen(d: Date) {
  try {
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

type FeedItem =
  | { kind: "completion"; task: Task; at: Date; key: string }
  | { kind: "overdue"; task: Task; at: Date; key: string };

function buildFeed(tasks: Task[], now: Date, max = 40): FeedItem[] {
  const items: FeedItem[] = [];

  for (const t of tasks) {
    if (t.status === "done" && t.completed_at) {
      const at = new Date(t.completed_at);
      if (!Number.isNaN(at.getTime())) {
        items.push({
          kind: "completion",
          task: t,
          at,
          key: `c-${t.id}-${t.completed_at}`,
        });
      }
    } else if (t.status === "pending" && isTaskOverdue(t, now)) {
      items.push({
        kind: "overdue",
        task: t,
        at: taskDueDateTime(t),
        key: `o-${t.id}`,
      });
    }
  }

  items.sort((a, b) => {
    const cmp = b.at.getTime() - a.at.getTime();
    if (cmp !== 0) return cmp;
    return a.key.localeCompare(b.key);
  });

  return items.slice(0, max);
}

type EmailNotifRow = {
  id: string;
  summary: string;
  subject: string | null;
  connected_account_id: string;
  thread_id: string | null;
  message_id: string;
  read_at: string | null;
  created_at: string;
  bucket_date: string;
};

type FollowReplyNotifRow = {
  id: string;
  task_id: string | null;
  status_label: string;
  source: string;
  intent: string;
  raw_text: string;
  from_email_preview: string | null;
  read_at: string | null;
  created_at: string;
};

type BellSize = "default" | "compact" | "topbar";

/**
 * Task completions/overdue plus today’s email summaries (profile timezone day).
 * On /dashboard, uses cockpit scope tasks; elsewhere uses `useTaskStore` (“my tasks”).
 */
export function AppNotificationBell({
  size = "default",
  className = "",
}: {
  size?: BellSize;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useUserStore((s) => s.user);
  const storeTasks = useTaskStore((s) => s.tasks);
  const setTasks = useTaskStore((s) => s.setTasks);
  const dashboardScopeTasks = useNotificationScopeStore((s) => s.dashboardScopeTasks);
  const setDashboardScopeTasks = useNotificationScopeStore((s) => s.setDashboardScopeTasks);

  const isDashboardPath = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const tasks =
    isDashboardPath && dashboardScopeTasks != null ? dashboardScopeTasks : storeTasks;

  React.useEffect(() => {
    if (!isDashboardPath) setDashboardScopeTasks(null);
  }, [isDashboardPath, setDashboardScopeTasks]);

  const [open, setOpen] = React.useState(false);
  const [readState, setReadState] = React.useState(() => {
    const s = readReadState();
    return { seenAt: s.seenAt, overdueIdsAtLastRead: new Set(s.overdueIdsAtLastRead) };
  });
  const { seenAt, overdueIdsAtLastRead } = readState;
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const prevOpenRef = React.useRef(false);
  const [now, setNow] = React.useState(() => new Date());
  const [emailRows, setEmailRows] = React.useState<EmailNotifRow[]>([]);
  const [followReplyRows, setFollowReplyRows] = React.useState<FollowReplyNotifRow[]>([]);

  const loadEmailNotifications = React.useCallback(async () => {
    try {
      const res = await fetch("/api/email-notifications", { cache: "no-store" });
      const j = (await res.json().catch(() => null)) as { notifications?: unknown } | null;
      if (res.ok && Array.isArray(j?.notifications)) {
        setEmailRows(j.notifications as EmailNotifRow[]);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadFollowReplyNotifications = React.useCallback(async () => {
    try {
      const res = await fetch("/api/follow-reply-notifications", { cache: "no-store" });
      const j = (await res.json().catch(() => null)) as { notifications?: unknown } | null;
      if (res.ok && Array.isArray(j?.notifications)) {
        setFollowReplyRows(j.notifications as FollowReplyNotifRow[]);
      }
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (!user) return;
    void loadEmailNotifications();
    void loadFollowReplyNotifications();
    const id = window.setInterval(() => {
      void loadEmailNotifications();
      void loadFollowReplyNotifications();
    }, 90_000);
    return () => window.clearInterval(id);
  }, [user, loadEmailNotifications, loadFollowReplyNotifications]);

  const feed = React.useMemo(() => buildFeed(tasks, now), [tasks, now]);

  const unreadCompletions = React.useMemo(() => {
    return feed.filter(
      (i) => i.kind === "completion" && i.at.getTime() > seenAt.getTime(),
    ).length;
  }, [feed, seenAt]);

  const unreadOverdue = React.useMemo(() => {
    return feed.some((i) => i.kind === "overdue" && !overdueIdsAtLastRead.has(i.task.id));
  }, [feed, overdueIdsAtLastRead]);

  const unreadEmailCount = React.useMemo(
    () => emailRows.filter((r) => !r.read_at).length,
    [emailRows],
  );

  const unreadFollowReplyCount = React.useMemo(
    () => followReplyRows.filter((r) => !r.read_at).length,
    [followReplyRows],
  );

  const showBadge =
    unreadCompletions > 0 || unreadOverdue || unreadEmailCount > 0 || unreadFollowReplyCount > 0;

  const prevBadgeRef = React.useRef<boolean | null>(null);
  React.useEffect(() => {
    const prev = prevBadgeRef.current;
    prevBadgeRef.current = showBadge;
    if (prev === null) return;
    if (prev || !showBadge) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const soundId = useNotificationSoundStore.getState().soundId;
    playNotificationSound(soundId);
  }, [showBadge]);

  React.useEffect(() => {
    if (open && !prevOpenRef.current) {
      const t = new Date();
      const overdueIds = feed.filter((i) => i.kind === "overdue").map((i) => i.task.id);
      writeReadState(t, overdueIds);
      setReadState({ seenAt: t, overdueIdsAtLastRead: new Set(overdueIds) });
      void fetch("/api/email-notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      }).then(() => {
        setEmailRows((rows) => rows.map((r) => ({ ...r, read_at: r.read_at ?? t.toISOString() })));
      });
      void fetch("/api/follow-reply-notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      }).then(() => {
        setFollowReplyRows((rows) => rows.map((r) => ({ ...r, read_at: r.read_at ?? t.toISOString() })));
      });
    }
    prevOpenRef.current = open;
  }, [open, feed]);

  React.useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        if (isDashboardPath) {
          let q = "";
          try {
            const raw = sessionStorage.getItem(DASHBOARD_VIEW_USER_STORAGE_KEY);
            if (raw && /^[0-9a-f-]{36}$/i.test(raw)) {
              q = `?view_user_id=${encodeURIComponent(raw)}`;
            }
          } catch {
            /* ignore */
          }
          const res = await fetch(`/api/dashboard/overview${q}`, { cache: "no-store" });
          const j = (await res.json().catch(() => null)) as { tasks?: unknown } | null;
          if (!cancelled && res.ok && Array.isArray(j?.tasks)) {
            setDashboardScopeTasks(j.tasks as Task[]);
          }
        } else {
          const supabase = createSupabaseBrowserClient();
          const next = await fetchMyTasks(supabase);
          if (!cancelled) setTasks(next);
        }
        if (!cancelled) {
          void loadEmailNotifications();
          void loadFollowReplyNotifications();
        }
      } catch {
        /* keep existing store / scope */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isDashboardPath,
    open,
    setDashboardScopeTasks,
    setTasks,
    user,
    loadEmailNotifications,
    loadFollowReplyNotifications,
  ]);

  React.useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  if (!user) return null;

  const graphicVariant = size === "compact" ? "compact" : size === "topbar" ? "topbar" : "default";

  const btnClass =
    size === "compact"
      ? "relative flex h-7 w-7 shrink-0 items-center justify-center overflow-visible rounded-md border border-border bg-muted text-muted-foreground hover:bg-foreground/5"
      : size === "topbar"
        ? "relative flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-md bg-transparent text-foreground transition-[transform,colors] hover:bg-muted/60 active:scale-[0.97]"
        : "relative flex h-9 w-9 shrink-0 items-center justify-center overflow-visible rounded-full border border-border bg-transparent text-foreground hover:bg-muted/60";

  const openFollowReply = (_row: FollowReplyNotifRow) => {
    router.push("/dashboard");
    setOpen(false);
  };

  const openEmail = (row: EmailNotifRow) => {
    const q = new URLSearchParams({
      gmailMessageId: row.message_id,
      gmailAccountId: row.connected_account_id,
    });
    router.push(`/scratchpad?${q.toString()}`);
    setOpen(false);
  };

  const hasFollowReplies = followReplyRows.length > 0;
  const hasEmail = emailRows.length > 0;
  const hasTaskFeed = feed.length > 0;
  const empty = !hasFollowReplies && !hasEmail && !hasTaskFeed;

  return (
    <div className={["relative", className].filter(Boolean).join(" ")} ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={btnClass}
        aria-label={showBadge ? "Notifications, unread" : "Notifications"}
        title="Notifications"
      >
        <NotificationBellGraphic variant={graphicVariant} showBadge={showBadge} />
      </button>

      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-[100] w-[min(calc(100vw-24px),22rem)] rounded-xl border border-border bg-background p-2 shadow-[0_12px_40px_rgba(61,45,33,0.18)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.55)]"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="border-b border-border/70 px-1 pb-2">
            <div className="text-[11px] font-semibold text-foreground">Notifications</div>
          </div>

          <ul className="max-h-[min(70vh,24rem)] space-y-1 overflow-y-auto pt-2">
            {empty ? (
              <li className="px-1 py-2 text-xs text-muted-foreground">No notifications yet.</li>
            ) : null}

            {hasFollowReplies ? (
              <li className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Follow-up updates
              </li>
            ) : null}
            {followReplyRows.map((row) => {
              const src = row.source === "web_link" ? "Link" : "Email";
              const preview =
                row.raw_text.trim().slice(0, 200) + (row.raw_text.length > 200 ? "…" : "");
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => openFollowReply(row)}
                    className={[
                      "w-full rounded-lg border px-2 py-1.5 text-left transition-colors",
                      row.read_at
                        ? "border-border/50 bg-muted/25 dark:bg-muted/15"
                        : "border-violet-500/35 bg-violet-50/90 dark:bg-violet-500/10",
                    ].join(" ")}
                  >
                    <div className="text-xs font-medium leading-snug text-foreground line-clamp-2">
                      {row.status_label} · {src}
                      {row.from_email_preview ? (
                        <span className="font-normal text-muted-foreground"> · {row.from_email_preview}</span>
                      ) : null}
                    </div>
                    {preview ? (
                      <div className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{preview}</div>
                    ) : null}
                    <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                      {formatWhen(new Date(row.created_at))}
                    </div>
                  </button>
                </li>
              );
            })}

            {hasEmail ? (
              <li
                className={[
                  "px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
                  hasFollowReplies ? "pt-2" : "",
                ].join(" ")}
              >
                Today&apos;s mail
              </li>
            ) : null}
            {emailRows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => openEmail(row)}
                  className={[
                    "w-full rounded-lg border px-2 py-1.5 text-left transition-colors",
                    row.read_at
                      ? "border-border/50 bg-muted/25 dark:bg-muted/15"
                      : "border-sky-500/35 bg-sky-50/90 dark:bg-sky-500/10",
                  ].join(" ")}
                >
                  <div className="text-xs font-medium leading-snug text-foreground line-clamp-3">{row.summary}</div>
                  {row.subject ? (
                    <div className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">{row.subject}</div>
                  ) : null}
                  <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                    {formatWhen(new Date(row.created_at))}
                  </div>
                </button>
              </li>
            ))}

            {(hasFollowReplies || hasEmail) && hasTaskFeed ? (
              <li className="px-1 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tasks
              </li>
            ) : null}

            {feed.map((item) => {
              if (item.kind === "completion") {
                const t = item.task;
                return (
                  <li
                    key={item.key}
                    className="rounded-lg border border-border/60 bg-muted/35 px-2 py-1.5 text-left dark:bg-muted/25"
                  >
                    <div className="text-xs font-medium leading-snug text-foreground line-clamp-2">{t.title}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {t.completed_by_name?.trim() ? (
                        <span>Completed by {t.completed_by_name.trim()}</span>
                      ) : (
                        <span>Task completed</span>
                      )}
                      <span className="tabular-nums"> · {formatWhen(item.at)}</span>
                    </div>
                  </li>
                );
              }
              const t = item.task;
              const label = overdueAgingLabel(t, now);
              return (
                <li
                  key={item.key}
                  className="rounded-lg border border-orange-500/35 bg-orange-50/90 px-2 py-1.5 text-left dark:bg-orange-500/10"
                >
                  <div className="text-xs font-medium leading-snug text-foreground line-clamp-2">{t.title}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {label ? <span className="font-medium text-orange-800 dark:text-orange-200">{label}</span> : null}
                    <span className="tabular-nums">
                      {" "}
                      · Due {t.due_date} {String(t.due_time).slice(0, 5)} · {t.assigned_to || "self"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
