"use client";

import type { ReactNode } from "react";
import type { DashboardKpis } from "@/modules/dashboard/types";

function IconTrend() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M7 17L17 7M17 7H9M17 7v8" />
    </svg>
  );
}

function KpiCard({
  label,
  value,
  subtitle,
  tone,
  footer,
  icon,
  onClick,
  attention = false,
}: {
  label: string;
  value: number;
  subtitle: string;
  tone: "orange" | "rose" | "amber" | "emerald" | "sky";
  footer: string;
  icon: ReactNode;
  onClick?: () => void;
  /** High-visibility frame (e.g. overdue). */
  attention?: boolean;
}) {
  const toneClass =
    tone === "orange"
      ? "from-orange-50/95 to-amber-50/50 border-orange-300/70 dark:from-orange-950/35 dark:to-amber-950/25 dark:border-orange-500/45"
      : tone === "rose"
        ? "from-rose-50/90 to-rose-100/40 border-rose-200/50"
        : tone === "amber"
          ? "from-amber-50/90 to-amber-100/40 border-amber-200/50"
          : tone === "emerald"
            ? "from-emerald-50/90 to-emerald-100/40 border-emerald-200/50"
            : "from-sky-50/90 to-sky-100/40 border-sky-200/50";

  const barClass =
    tone === "orange"
      ? "bg-orange-500/90"
      : tone === "rose"
        ? "bg-rose-500/85"
        : tone === "amber"
          ? "bg-amber-500/85"
          : tone === "emerald"
            ? "bg-emerald-500/85"
            : "bg-sky-500/85";

  const pct = value === 0 ? 8 : Math.min(100, 12 + value * 14);

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative overflow-hidden rounded-2xl border bg-gradient-to-br p-3 text-left transition-colors hover:bg-foreground/[0.02]",
        toneClass,
        attention
          ? "ring-2 ring-orange-500/75 shadow-[0_0_0_1px_rgba(249,115,22,0.25),0_12px_28px_-8px_rgba(234,88,12,0.35)] dark:ring-orange-400/55 dark:shadow-[0_0_0_1px_rgba(251,146,60,0.2),0_12px_28px_-8px_rgba(234,88,12,0.25)]"
          : "",
      ].join(" ")}
    >
      <div className="absolute right-2 top-2 text-muted-foreground/80">{icon}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tabular-nums leading-none text-foreground">{value}</span>
        <span className="text-muted-foreground">
          <IconTrend />
        </span>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{subtitle}</div>
      <div className="mt-3 h-1.5 w-full rounded-full bg-background/50">
        <div className={`h-1.5 rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{footer}</div>
    </button>
  );
}

export function KpiCards({
  kpis,
  onSelect,
}: {
  kpis: DashboardKpis;
  onSelect: (key: "overdue" | "waitingResponses" | "activePriorities" | "todaysLoad") => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Overdue"
        value={kpis.overdue}
        subtitle="Past due (any assignee)"
        tone="orange"
        attention={kpis.overdue > 0}
        footer={kpis.overdue === 0 ? "All clear" : "Action required"}
        onClick={() => onSelect("overdue")}
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        }
      />
      <KpiCard
        label="Waiting Responses"
        value={kpis.waitingResponses}
        subtitle="Blocked on stakeholders"
        tone="amber"
        footer="Follow-ups needed"
        onClick={() => onSelect("waitingResponses")}
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
        }
      />
      <KpiCard
        label="Active Priorities"
        value={kpis.activePriorities}
        subtitle="Total pending queue"
        tone="emerald"
        footer="In queue"
        onClick={() => onSelect("activePriorities")}
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3v18h18" />
            <path d="M7 16l4-4 4 4 6-6" />
          </svg>
        }
      />
      <KpiCard
        label="Today's Load"
        value={kpis.todaysLoad}
        subtitle="Immediate focus items"
        tone="sky"
        footer="Execute"
        onClick={() => onSelect("todaysLoad")}
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        }
      />
    </div>
  );
}
