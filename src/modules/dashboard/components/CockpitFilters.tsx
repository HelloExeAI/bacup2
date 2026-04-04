"use client";

import type { DashboardViewOption } from "@/modules/dashboard/types";

type TypeFilter = "all" | "todo" | "followup" | "reminder";
type SourceFilter = "all" | "scratchpad" | "manual" | "ai" | "email" | "recurring";

export function CockpitFilters({
  viewOptions,
  viewUserId,
  onViewChange,
  typeFilter,
  onTypeChange,
  sourceFilter,
  onSourceChange,
  disabled,
}: {
  viewOptions: DashboardViewOption[];
  viewUserId: string | null;
  onViewChange: (id: string) => void;
  typeFilter: TypeFilter;
  onTypeChange: (v: TypeFilter) => void;
  sourceFilter: SourceFilter;
  onSourceChange: (v: SourceFilter) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">View</span>
        <select
          value={viewUserId ?? viewOptions[0]?.user_id ?? ""}
          onChange={(e) => onViewChange(e.target.value)}
          disabled={disabled}
          className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none disabled:opacity-60"
        >
          {viewOptions.map((o) => (
            <option key={o.user_id} value={o.user_id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Type</span>
        <select
          value={typeFilter}
          onChange={(e) => onTypeChange(e.target.value as TypeFilter)}
          disabled={disabled}
          className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none disabled:opacity-60"
        >
          <option value="all">All</option>
          <option value="todo">Todo</option>
          <option value="followup">Follow-up</option>
          <option value="reminder">Reminder</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Priority</span>
        <select
          defaultValue="all"
          disabled
          className="h-8 cursor-not-allowed rounded-lg border border-border bg-muted px-2 text-xs text-muted-foreground"
          title="Coming soon"
        >
          <option value="all">All</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Source</span>
        <select
          value={sourceFilter}
          onChange={(e) => onSourceChange(e.target.value as SourceFilter)}
          disabled={disabled}
          className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none disabled:opacity-60"
        >
          <option value="all">All</option>
          <option value="scratchpad">Scratchpad</option>
          <option value="manual">Manual</option>
          <option value="ai">AI</option>
          <option value="email">Email</option>
          <option value="recurring">Recurring</option>
        </select>
      </label>
    </div>
  );
}
