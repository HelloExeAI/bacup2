"use client";

import * as React from "react";
import type { DashboardOverviewPayload } from "@/modules/dashboard/types";

export function useDashboardOverview() {
  const [data, setData] = React.useState<DashboardOverviewPayload | null>(null);
  const [selectedViewUserId, setSelectedViewUserId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (viewUserId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const q = viewUserId ? `?view_user_id=${encodeURIComponent(viewUserId)}` : "";
      const res = await fetch(`/api/dashboard/overview${q}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `Failed (${res.status})`);
      const payload = j as DashboardOverviewPayload;
      setData(payload);
      setSelectedViewUserId(payload.selectedViewUserId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const changeView = React.useCallback(
    async (nextViewUserId: string) => {
      setSelectedViewUserId(nextViewUserId);
      await load(nextViewUserId);
    },
    [load],
  );

  return { data, loading, error, selectedViewUserId, changeView, reload: load };
}

