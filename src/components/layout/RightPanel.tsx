"use client";

import * as React from "react";
import { TodayFocus } from "@/modules/tasks/TodayFocus";
import { WatchListModal, type WatchTab } from "@/modules/tasks/WatchList";
import { AgendaCalendarPanel } from "@/modules/calendar/AgendaCalendarPanel";

export function RightPanel() {
  const [watchOpen, setWatchOpen] = React.useState(false);
  const [watchDueDateFilter, setWatchDueDateFilter] = React.useState<string | undefined>(undefined);
  const [watchListTitle, setWatchListTitle] = React.useState<string | undefined>(undefined);
  const [watchInitialTab, setWatchInitialTab] = React.useState<WatchTab | undefined>(undefined);

  return (
    <aside className="hidden w-80 min-w-0 shrink-0 bg-background/40 backdrop-blur xl:block">
      <div className="flex min-h-0 flex-col gap-3 p-3">
        <section className="min-w-0 rounded-2xl feed-surface p-3">
          <TodayFocus
            onOpenTasks={(opts) => {
              setWatchDueDateFilter(opts?.dueDateFilter);
              setWatchListTitle(opts?.listTitle);
              setWatchInitialTab(opts?.initialTab);
              setWatchOpen(true);
            }}
          />
        </section>
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
          setWatchInitialTab(undefined);
        }}
        dueDateFilter={watchDueDateFilter}
        listTitle={watchListTitle}
        initialTab={watchInitialTab}
      />
    </aside>
  );
}

