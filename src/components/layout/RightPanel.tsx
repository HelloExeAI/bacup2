"use client";

import { TodayFocus } from "@/modules/tasks/TodayFocus";
import { AskSAM } from "@/modules/ai/AskSAM";

export function RightPanel() {
  return (
    <aside className="hidden w-80 shrink-0 border-l border-border bg-background xl:block">
      <div className="space-y-4 p-4">
        <section className="rounded-lg border border-border bg-background p-4 shadow-sm">
          <div className="text-sm font-semibold">Today&apos;s Focus</div>
          <TodayFocus />
        </section>
        <section className="rounded-lg border border-border bg-background p-4 shadow-sm">
          <div className="text-sm font-semibold">SAM Suggestions</div>
          <AskSAM />
        </section>
      </div>
    </aside>
  );
}

