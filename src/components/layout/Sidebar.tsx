"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { SidebarCalendar } from "@/components/calendar/SidebarCalendar";
import { useScratchpadStore } from "@/store/scratchpadStore";
import { WatchListModal } from "@/modules/tasks/WatchList";

export function Sidebar() {
  const pathname = usePathname();
  const setSelectedDate = useScratchpadStore((s) => s.setSelectedDate);
  const [watchOpen, setWatchOpen] = React.useState(false);
  const dashboardActive = pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  return (
    <aside className="hidden w-60 shrink-0 border-r border-border/80 bg-background/70 md:block">
      <div className="space-y-3 p-3">
        <section className="rounded-xl bg-muted/45 p-3 shadow-[0_10px_24px_rgba(0,0,0,0.08)]">
          <SidebarCalendar
            onDateChange={(d) => {
              // Store as YYYY-MM-DD in local time.
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, "0");
              const day = String(d.getDate()).padStart(2, "0");
              setSelectedDate(`${y}-${m}-${day}`);
            }}
          />
        </section>
        <div className="mx-1 h-px bg-border/50" />
        <section className="rounded-xl bg-muted/45 p-3 shadow-[0_10px_24px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-center gap-2">
            <Link
              href="/dashboard"
              aria-label="Open Dashboard"
              className={[
                "inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted/80 shadow-sm transition-colors",
                dashboardActive
                  ? "text-blue-600"
                  : "text-blue-500 hover:bg-foreground/5",
              ].join(" ")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
              </svg>
            </Link>
            <button
              type="button"
              onClick={() => setWatchOpen(true)}
              className="inline-flex h-10 items-center rounded-full bg-muted/80 px-4 text-[11px] font-semibold tracking-wide text-foreground shadow-sm hover:bg-foreground/5"
            >
              Watch List
            </button>
          </div>
        </section>
      </div>
      <WatchListModal open={watchOpen} onClose={() => setWatchOpen(false)} />
    </aside>
  );
}

