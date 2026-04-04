"use client";

import type { DashboardViewOption } from "@/modules/dashboard/types";

export function ViewFilter({
  options,
  value,
  onChange,
  disabled,
}: {
  options: DashboardViewOption[];
  value: string | null;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="dashboard-view-filter" className="text-xs font-semibold text-muted-foreground">
        View
      </label>
      <select
        id="dashboard-view-filter"
        value={value ?? options[0]?.user_id ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-8 min-w-[180px] rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o.user_id} value={o.user_id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

