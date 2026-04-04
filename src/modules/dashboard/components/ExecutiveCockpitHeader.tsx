"use client";

import * as React from "react";

import { AppNotificationBell } from "@/components/notifications/AppNotificationBell";

function IconArrowLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** e.g. "28 March 2026" — deterministic, local calendar (no ISO string). */
function formatCockpitDate(d = new Date()) {
  const day = d.getDate();
  const month = MONTHS_LONG[d.getMonth()]!;
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/** ~60% scale vs previous cockpit header (tighter padding + type). */
function ExecutiveCockpitTitle() {
  return (
    <div className="relative inline-block shrink-0">
      <div
        className="rounded-2xl border border-[#E0DDD6] bg-[#F5F3EF] px-3 py-1 shadow-[0_1px_2px_rgba(90,80,70,0.06)] dark:border-border dark:bg-muted/70 dark:shadow-sm"
        role="presentation"
      >
        <h1 className="text-xs font-semibold tracking-tight text-[#6D665F] sm:text-sm md:text-[0.95rem] dark:text-foreground">
          Executive Cockpit
        </h1>
      </div>
      <span
        className="bacup-live-dot-pulse pointer-events-none absolute -right-1 -top-1 z-10 h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.9)] ring-1 ring-[#F5F3EF] dark:bg-emerald-400 dark:ring-background"
        aria-hidden
        title="Live"
      />
    </div>
  );
}

export function ExecutiveCockpitHeader({
  showBack,
  onBack,
  onClose,
}: {
  showBack: boolean;
  onBack?: () => void;
  onClose?: () => void;
}) {
  const [dateLabel, setDateLabel] = React.useState("");
  React.useEffect(() => {
    setDateLabel(formatCockpitDate());
  }, []);

  return (
    <header className="relative mb-2 border-b border-border/80 pb-1.5">
      <div className="pointer-events-none absolute left-1/2 top-0 hidden -translate-x-1/2 text-center md:block">
        <div className="text-xs font-semibold tracking-wide text-foreground sm:text-sm">{dateLabel || "—"}</div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          {showBack ? (
            <button
              type="button"
              onClick={onBack}
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-foreground hover:bg-foreground/5"
              aria-label="Back"
            >
              <IconArrowLeft />
            </button>
          ) : null}
          <div className="min-w-0">
            <ExecutiveCockpitTitle />
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center justify-center md:hidden">
          <div className="text-xs font-semibold tracking-wide text-foreground sm:text-sm">{dateLabel || "—"}</div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1 md:min-w-[100px]">
          <AppNotificationBell size="compact" />
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground hover:bg-foreground/5"
            aria-label="Close dashboard"
          >
            <IconClose />
          </button>
        </div>
      </div>
    </header>
  );
}
