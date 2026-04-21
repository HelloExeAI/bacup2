import * as React from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";

import { KpiTile } from "@/components/KpiTile";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/context/AuthContext";
import { useAppTheme } from "@/context/ThemeContext";
import { briefTaskStats } from "@/lib/taskStats";

/** Consolidated operational view: same task universe as Overview + assignee grouping (web Workspace hub is richer). */
export default function ConsolidatedTab() {
  const { tasks, refreshData } = useAuth();
  const { theme } = useAppTheme();
  const [refreshing, setRefreshing] = React.useState(false);

  const stats = React.useMemo(() => briefTaskStats(tasks), [tasks]);

  const byAssignee = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (t.status !== "pending") continue;
      const a = String(t.assigned_to ?? "").trim() || "Unassigned";
      map.set(a, (map.get(a) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [tasks]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refreshData();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Screen
      title="Consolidated"
      subtitle="One glance across open work, grouped by assignee. Syncs with the web app via the same tasks table."
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.accent} />
      }
    >
      <View style={styles.row}>
        <KpiTile label="Pending" value={stats.pendingTotal} />
        <KpiTile label="Overdue" value={stats.overdue} />
      </View>
      <Text style={[styles.section, { color: theme.mutedForeground }]}>By assignee</Text>
      {byAssignee.length === 0 ? (
        <Text style={{ color: theme.mutedForeground }}>No pending tasks.</Text>
      ) : (
        byAssignee.map(([name, count]) => (
          <View
            key={name}
            style={[styles.rowItem, { borderColor: theme.border, backgroundColor: theme.card }]}
          >
            <Text style={[styles.assignee, { color: theme.foreground }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[styles.count, { color: theme.mutedForeground }]}>{count}</Text>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginBottom: 16 },
  section: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 },
  rowItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  assignee: { flex: 1, fontSize: 14, fontWeight: "600", marginRight: 8 },
  count: { fontSize: 14, fontWeight: "700" },
});
