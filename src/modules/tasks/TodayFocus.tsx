"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useTaskStore } from "@/store/taskStore";
import { useEventStore } from "@/store/eventStore";
import { useUserStore } from "@/store/userStore";
import { isTaskOverdue } from "@/lib/tasks/taskOverdue";
import { isTaskSelfAssigned } from "@/lib/tasks/assignee";
import {
  buildDayBriefInput,
  fallbackDayBriefing,
  ymdToday,
} from "@/modules/tasks/dayBriefing";
import { nextWorkingDate, readWeekendConfig } from "@/modules/tasks/weekendPolicy";
import { OverdueListModal } from "@/modules/tasks/OverdueListModal";
import { ScheduleConflictModal } from "@/modules/tasks/ScheduleConflictModal";
import { detectScheduleConflicts } from "@/lib/scheduling/detectScheduleConflicts";
import type { TimelineItem } from "@/lib/timeline/types";
import { fetchTodayTimelineCached, peekTodayTimelineCache } from "@/lib/timeline/todayClientCache";
import type { WatchTab } from "@/modules/tasks/WatchList";
import { setOverviewKpiListener, type OverviewKpiKind } from "@/modules/tasks/overviewKpiBus";

/** No borders — depth via shadow only (app UI convention). */
const focusExpandedCardClass =
  "rounded-xl bg-muted p-3 shadow-[0_1px_0_rgba(70,54,39,0.04),0_10px_24px_rgba(61,45,33,0.1)] dark:shadow-[0_10px_28px_rgba(0,0,0,0.38)]";

const focusExpandedCardInteractiveClass = `${focusExpandedCardClass} w-full cursor-pointer text-left outline-none transition-[filter,transform] hover:brightness-[1.03] active:scale-[0.995] focus-visible:ring-2 focus-visible:ring-ring/60 dark:hover:brightness-110`;

export type OpenWatchListOptions = {
  /** Limit Watch List to tasks with this due date (YYYY-MM-DD), e.g. today for top priorities. */
  dueDateFilter?: string;
  /** Modal title (default: “Watch List”). Use “Today’s tasks” from Top Priorities so UI matches Today’s Focus. */
  listTitle?: string;
  /** Initial tab in Watch List (e.g. follow-up KPI). */
  initialTab?: WatchTab;
};

export type TodayFocusProps = {
  /** Opens Watch List; pass `dueDateFilter` to show only tasks due on that day. */
  onOpenTasks?: (opts?: OpenWatchListOptions) => void;
};

export function TodayFocus({ onOpenTasks }: TodayFocusProps) {
  const router = useRouter();
  const tasks = useTaskStore((s) => s.tasks);
  const profile = useUserStore((s) => s.profile);
  const events = useEventStore((s) => s.events);
  const today = ymdToday();
  const [bullets, setBullets] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [overdueModalOpen, setOverdueModalOpen] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const initialPeek = useMemo(() => peekTodayTimelineCache(), []);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[] | null>(initialPeek.data?.items ?? null);
  const [timelineLoading, setTimelineLoading] = useState(!initialPeek.fresh);

  const fetchTimeline = useCallback(
    async (opts?: { force?: boolean }) => {
      const force = Boolean(opts?.force);
      const peek = force ? { fresh: false, data: null } : peekTodayTimelineCache();
      if (!force && peek.fresh && peek.data) {
        setTimelineItems(peek.data.items);
        setTimelineLoading(false);
        return;
      }
      setTimelineLoading(true);
      try {
        const { data } = await fetchTodayTimelineCached({ force });
        setTimelineItems(data.items ?? []);
      } catch {
        setTimelineItems([]);
      } finally {
        setTimelineLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchTimeline({ force: false });
  }, [fetchTimeline]);

  const compact = (line: string) => {
    const s = line.replace(/\s+/g, " ").trim();
    if (s.length <= 78) return s;
    return `${s.slice(0, 77).trimEnd()}...`;
  };

  const {
    todayTasks,
    doneToday,
    todayEvents,
    backlog,
    tomorrowDate,
    tomorrowPriorities,
    overdueSelf,
    overdueTeam,
    input,
    progress,
  } = useMemo(() => {
    const pending = tasks.filter((t) => t.status === "pending");
    const doneToday = tasks.filter((t) => t.status === "done" && t.due_date === today);
    const todayTasks = pending
      .filter((t) => t.due_date === today)
      .sort((a, b) => (a.due_time ?? "").localeCompare(b.due_time ?? ""));
    const todayEvents = events
      .filter((e) => e.date === today)
      .sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? "")));
    const backlog = pending
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .slice(0, 8);
    const weekendCfg = readWeekendConfig();
    const tomorrowDate = nextWorkingDate(today, weekendCfg);
    const tomorrowPriorities = pending
      .filter((t) => t.due_date === tomorrowDate)
      .sort((a, b) => (a.due_time ?? "").localeCompare(b.due_time ?? ""))
      .slice(0, 5);
    const now = new Date();
    const overduePending = pending.filter((t) => isTaskOverdue(t, now));
    let overdueSelf = 0;
    let overdueTeam = 0;
    for (const t of overduePending) {
      if (isTaskSelfAssigned(t, profile)) overdueSelf += 1;
      else overdueTeam += 1;
    }
    return {
      todayTasks,
      doneToday,
      todayEvents,
      backlog,
      tomorrowDate,
      tomorrowPriorities,
      overdueSelf,
      overdueTeam,
      input: buildDayBriefInput(tasks, events),
      progress:
        todayTasks.length + doneToday.length === 0
          ? 0
          : Math.round((doneToday.length / (todayTasks.length + doneToday.length)) * 100),
    };
  }, [events, profile, tasks, today]);

  const openWatchList = useCallback(
    (opts?: OpenWatchListOptions) => {
      setOpen(false);
      window.setTimeout(() => {
        if (onOpenTasks) onOpenTasks(opts);
        else router.push("/tasks");
      }, 0);
    },
    [onOpenTasks, router],
  );

  useEffect(() => {
    let cancelled = false;
    const fallback = fallbackDayBriefing(todayTasks, todayEvents, backlog);
    setBullets(fallback.slice(0, 3).map(compact));
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          setLoading(true);
          const res = await fetch("/api/day-brief", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
          });
          const j = await res.json().catch(() => null);
          if (!res.ok) throw new Error(j?.error || `Day brief failed (${res.status})`);
          const next = Array.isArray(j?.bullets) ? j.bullets.map(String).filter(Boolean) : [];
          if (!cancelled && next.length > 0) setBullets(next.slice(0, 3).map(compact));
        } catch {
          // Keep fallback bullets.
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [backlog, input, todayEvents, todayTasks]);

  const scheduleConflicts = useMemo(
    () => detectScheduleConflicts(today, todayTasks, todayEvents, timelineLoading ? null : timelineItems),
    [today, todayTasks, todayEvents, timelineItems, timelineLoading],
  );
  const conflictCount = scheduleConflicts.length;

  useEffect(() => {
    const run = (kind: OverviewKpiKind) => {
      try {
        posthog.capture("overview_kpi_click", { kind });
      } catch {
        /* optional */
      }
      switch (kind) {
        case "overdue":
          setOverdueModalOpen(true);
          return;
        case "todaysLoad":
          openWatchList({ dueDateFilter: today, listTitle: "Today's load", initialTab: "all" });
          return;
        case "followups":
          openWatchList({ listTitle: "Follow-ups", initialTab: "followup" });
          return;
        case "priorities":
          openWatchList({ listTitle: "Priorities", initialTab: "todo" });
          return;
        case "pendingDecisions":
          document.getElementById("approvals-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
      }
    };
    setOverviewKpiListener(run);
    return () => setOverviewKpiListener(null);
  }, [today, openWatchList]);

  const briefingReady = bullets.length > 0;
  const topPriorityTasks = todayTasks.slice(0, 3);
  const nextTask = todayTasks[0] ?? backlog[0];
  const nextBestAction = nextTask?.title ?? "Nothing pending. You're clear.";
  const aiSummary = briefingReady ? bullets.slice(0, 2).join(" ") : "";
  const allTodayCompleted = doneToday.length > 0 && todayTasks.length === 0;
  const headline = !briefingReady
    ? "Preparing your day briefing..."
    : allTodayCompleted
      ? `Completed ${doneToday.length} task${doneToday.length > 1 ? "s" : ""}.`
      : bullets[0];
  const progressBarClass =
    progress >= 100
      ? "bg-emerald-500/80"
      : progress >= 70
        ? "bg-blue-500/70"
        : progress >= 35
          ? "bg-amber-500/70"
          : "bg-foreground/30";
  const tomorrowLabel = (() => {
    const [y, m, d] = tomorrowDate.split("-").map(Number);
    const nextDate = new Date(y || 0, (m || 1) - 1, d || 1);
    const weekday = nextDate.toLocaleDateString(undefined, { weekday: "long" });
    return `${weekday} Priorities`;
  })();

  return (
    <>
      <div className="mt-1 flex items-center justify-between">
        <div className="text-xs font-semibold tracking-wide text-foreground">Today&apos;s Focus</div>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            posthog.capture("today_focus_opened", { progress, overdue_self: overdueSelf, overdue_team: overdueTeam });
          }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-lg leading-none text-muted-foreground hover:bg-foreground/5"
          aria-label="Open Today Focus"
        >
          ›
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          setOpen(true);
          posthog.capture("today_focus_opened", { progress, overdue_self: overdueSelf, overdue_team: overdueTeam });
        }}
        className="mt-1 w-full rounded-md bg-muted/55 p-2 text-left shadow-[0_10px_24px_rgba(0,0,0,0.08)] hover:bg-foreground/5"
      >
        <div className="mt-1 text-sm text-foreground">{headline}</div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Daily progress</span>
          <span>{progress}%</span>
        </div>
        <div className="mt-1 h-2 w-full rounded-full bg-muted">
          <div className={`h-2 rounded-full transition-colors ${progressBarClass}`} style={{ width: `${progress}%` }} />
        </div>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
          <button
            type="button"
            aria-label="Close Today Focus"
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 flex max-h-[min(88vh,900px)] w-full max-w-[760px] flex-col overflow-hidden rounded-xl bg-background shadow-[0_1px_0_rgba(70,54,39,0.05),0_12px_40px_rgba(61,45,33,0.14)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.55)]">
            <div className="flex shrink-0 items-center justify-between px-4 py-3">
              <div className="text-sm font-semibold">Today&apos;s Focus</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-muted px-3 py-1 text-xs text-foreground shadow-[0_1px_0_rgba(70,54,39,0.06),0_6px_16px_rgba(61,45,33,0.1)] hover:bg-foreground/5 dark:shadow-[0_8px_20px_rgba(0,0,0,0.35)]"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <section className={focusExpandedCardClass}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI Summary</div>
                <div className="mt-1 text-base text-foreground">
                  {aiSummary || "Briefing is still loading — task counts below are live."}
                </div>
              </section>

              <button
                type="button"
                className={focusExpandedCardInteractiveClass}
                onClick={() => setOverdueModalOpen(true)}
                aria-label="Open overdue task list"
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overdue</div>
                <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-sm text-foreground">
                  <span>
                    You: <span className="font-semibold tabular-nums">{overdueSelf}</span>
                  </span>
                  <span>
                    Team: <span className="font-semibold tabular-nums">{overdueTeam}</span>
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Pending tasks past their due date and time. Tap to filter by you or team.
                </p>
              </button>

              <button
                type="button"
                className={focusExpandedCardInteractiveClass}
                onClick={() =>
                  openWatchList({ dueDateFilter: today, listTitle: "Today's tasks" })
                }
                aria-label="Open today’s task list"
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Top Priorities <span className="font-normal text-muted-foreground">(today)</span>
                </div>
                {topPriorityTasks.length === 0 ? (
                  <div className="mt-1 text-base text-muted-foreground">Nothing pending for today.</div>
                ) : (
                  <div className="mt-1 space-y-1">
                    {topPriorityTasks.map((t) => (
                      <div key={t.id} className="text-base text-foreground">
                        • {t.title}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Tap to open Watch List — tasks due today only
                </div>
              </button>

              <button
                type="button"
                className={focusExpandedCardInteractiveClass}
                onClick={() => openWatchList()}
                aria-label="Open Watch List for next best action"
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next Best Action</div>
                <div className="mt-1 text-base text-foreground">• {nextBestAction}</div>
                <div className="mt-2 text-[11px] text-muted-foreground">Tap to open Watch List</div>
              </button>

              <section className={focusExpandedCardClass}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {tomorrowLabel}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">For {tomorrowDate}</div>
                {tomorrowPriorities.length === 0 ? (
                  <div className="mt-1 text-base text-muted-foreground">No planned priorities yet.</div>
                ) : (
                  <div className="mt-1 space-y-1">
                    {tomorrowPriorities.map((p) => (
                      <div key={p.id} className="text-base text-foreground">
                        • {p.title}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({String(p.due_time).slice(0, 5)} · {p.assigned_to})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className={focusExpandedCardClass}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conflicts</div>
                <div className="mt-1 text-base text-foreground">
                  {conflictCount > 0
                    ? `${conflictCount} schedule conflict${conflictCount > 1 ? "s" : ""} detected.`
                    : "No conflicts detected."}
                </div>
              </section>

              <section className={focusExpandedCardClass}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Daily Progress</div>
                <div className="mt-1 text-2xl font-semibold text-foreground">{progress}%</div>
                <div className="mt-2 h-2.5 w-full rounded-full bg-muted">
                  <div
                    className={`h-2.5 rounded-full transition-colors ${progressBarClass}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {loading ? <div className="mt-2 text-[11px] text-muted-foreground">Refreshing briefing...</div> : null}
              </section>
            </div>
          </div>
        </div>
      ) : null}

      <OverdueListModal open={overdueModalOpen} onClose={() => setOverdueModalOpen(false)} initialScope="all" />

      <ScheduleConflictModal
        open={conflictModalOpen}
        onClose={() => setConflictModalOpen(false)}
        todayYmd={today}
        tasks={tasks}
        localEvents={events}
        timelineItems={timelineItems}
        timelineLoading={timelineLoading}
        onRescheduled={() => void fetchTimeline({ force: true })}
      />
    </>
  );
}

