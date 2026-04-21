import * as React from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";

import { KpiTile } from "@/components/KpiTile";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/context/AuthContext";
import { useAppTheme } from "@/context/ThemeContext";
import { todayFocusLines } from "@/lib/dayBrief";
import { briefTaskStats } from "@/lib/taskStats";

export default function OverviewTab() {
  const { tasks, events, refreshData } = useAuth();
  const { theme } = useAppTheme();
  const [refreshing, setRefreshing] = React.useState(false);

  const stats = React.useMemo(() => briefTaskStats(tasks), [tasks]);
  const briefLines = React.useMemo(
    () =>
      todayFocusLines(
        tasks.map((t) => ({
          status: t.status,
          due_date: t.due_date,
          due_time: t.due_time,
          type: t.type,
          title: t.title,
        })),
        events.map((e) => ({
          date: e.date,
          time: e.time,
          title: e.title,
        })),
      ),
    [tasks, events],
  );

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
      title="Overview"
      scroll
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.accent} />
      }
    >
      <View style={styles.row}>
        <KpiTile label="Overdue" value={stats.overdue} />
        <KpiTile label="Due today" value={stats.todaysLoad} />
      </View>
      <View style={styles.row}>
        <KpiTile label="Follow-ups" value={stats.waitingFollowups} />
        <KpiTile label="Priorities" value={stats.activePriorities} />
      </View>
      <View style={[styles.banner, { backgroundColor: theme.muted, borderColor: theme.border }]}>
        <Text style={[styles.bannerTitle, { color: theme.foreground }]}>Open actions</Text>
        <Text style={[styles.bannerMeta, { color: theme.mutedForeground }]}>
          {stats.pendingTotal} pending tasks · pull to refresh
        </Text>
      </View>

      <View style={[styles.briefCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
        <Text style={[styles.briefTitle, { color: theme.foreground }]}>{"Today's focus"}</Text>
        {briefLines.map((line, i) => (
          <Text key={i} style={[styles.briefLine, { color: theme.mutedForeground }]}>
            · {line}
          </Text>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  banner: { marginTop: 8, padding: 14, borderRadius: 14, borderWidth: 1 },
  bannerTitle: { fontSize: 14, fontWeight: "700" },
  bannerMeta: { marginTop: 4, fontSize: 12 },
  briefCard: { marginTop: 14, padding: 14, borderRadius: 14, borderWidth: 1 },
  briefTitle: { fontSize: 14, fontWeight: "700", marginBottom: 8 },
  briefLine: { fontSize: 13, lineHeight: 20, marginBottom: 4 },
});
