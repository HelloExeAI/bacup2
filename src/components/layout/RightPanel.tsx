"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { TodayFocus } from "@/modules/tasks/TodayFocus";
import { WatchListModal } from "@/modules/tasks/WatchList";
import { AgendaCalendarPanel } from "@/modules/calendar/AgendaCalendarPanel";

export function RightPanel() {
  const pathname = usePathname();
  const showTodayFocusSidebar = pathname !== "/workspace";
  const [watchOpen, setWatchOpen] = React.useState(false);
  const [watchDueDateFilter, setWatchDueDateFilter] = React.useState<string | undefined>(undefined);
  const [watchListTitle, setWatchListTitle] = React.useState<string | undefined>(undefined);

  return (
    <aside className="hidden w-80 min-w-0 shrink-0 bg-background/70 xl:block">
      <div className="flex min-h-0 flex-col gap-3 p-3">
        {showTodayFocusSidebar ? (
          <section className="min-w-0 rounded-xl bacup-surface p-3">
            <TodayFocus
              onOpenTasks={(opts) => {
                setWatchDueDateFilter(opts?.dueDateFilter);
                setWatchListTitle(opts?.listTitle);
                setWatchOpen(true);
              }}
            />
          </section>
        ) : null}
        <div className="min-h-0 min-w-0">
          <AgendaCalendarPanel />
        </div>
      </div>
      <WatchListModal
        open={watchOpen}
        onClose={() => {
          setWatchOpen(false);
          setWatchDueDateFilter(undefined);
          setWatchListTitle(undefined);
        }}
        dueDateFilter={watchDueDateFilter}
        listTitle={watchListTitle}
      />
    </aside>
  );
}

