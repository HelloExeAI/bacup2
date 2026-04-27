import * as React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Screen } from "@/components/Screen";
import { useAuth, type TaskRow } from "@/context/AuthContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useAppTheme } from "@/context/ThemeContext";
import { formatDate, formatTime } from "@/lib/dateTimePrefs";
import { isTaskOverdue, ymdToday } from "@/lib/taskStats";

type Filter = "pending" | "overdue" | "today" | "followups" | "priorities";

function titleForFilter(filter: Filter) {
  switch (filter) {
    case "pending":
      return "Pending";
    case "overdue":
      return "Overdue";
    case "today":
      return "Due today";
    case "followups":
      return "Follow-ups";
    case "priorities":
      return "Priorities";
  }
}

function applyFilter(tasks: TaskRow[], filter: Filter): TaskRow[] {
  const pending = tasks.filter((t) => t.status === "pending");
  const today = ymdToday();
  switch (filter) {
    case "pending":
      return pending;
    case "overdue":
      return pending.filter((t) => isTaskOverdue(t));
    case "today":
      return pending.filter((t) => t.due_date === today);
    case "followups":
      return pending.filter((t) => t.type === "followup");
    case "priorities":
      return pending.filter((t) => t.type === "todo");
  }
}

function formatDue(t: Pick<TaskRow, "due_date" | "due_time">) {
  // Placeholder; real formatting uses user prefs inside the component.
  const time = String(t.due_time ?? "").trim();
  return time ? `${t.due_date} · ${time}` : t.due_date;
}

export default function TasksKpiList() {
  const { tasks } = useAuth();
  const { theme } = useAppTheme();
  const { dateFormat, timeFormat } = usePreferences();
  const params = useLocalSearchParams();

  const filter: Filter = (params.filter === "pending" ||
  params.filter === "overdue" ||
  params.filter === "today" ||
  params.filter === "followups" ||
  params.filter === "priorities"
    ? params.filter
    : "pending") as Filter;

  const data = React.useMemo(() => applyFilter(tasks, filter), [tasks, filter]);
  const fmt = React.useCallback(
    (t: Pick<TaskRow, "due_date" | "due_time">) => {
      const d = formatDate(t.due_date, dateFormat);
      const time = formatTime(String(t.due_time ?? "").slice(0, 5), timeFormat).trim();
      return time ? `${d} · ${time}` : d;
    },
    [dateFormat, timeFormat],
  );

  const returnTo =
    params.returnTo === "overview" || params.returnTo === "team"
      ? (params.returnTo as "overview" | "team")
      : null;

  const headerRight = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      onPress={() => {
        if (returnTo === "team") {
          router.replace("/(tabs)/consolidated");
          return;
        }
        if (returnTo === "overview") {
          router.replace("/(tabs)/overview");
          return;
        }
        router.back();
      }}
      style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.7 : 1 }]}
    >
      <Ionicons name="close" size={18} color={theme.foreground} />
    </Pressable>
  );

  return (
    <Screen
      title={titleForFilter(filter)}
      subtitle={`${data.length} task${data.length === 1 ? "" : "s"}`}
      headerRight={headerRight}
      scroll={false}
    >
      {data.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={[styles.emptyTitle, { color: theme.foreground }]}>Nothing here.</Text>
          <Text style={[styles.emptyMeta, { color: theme.mutedForeground }]}>Try another KPI on the Overview screen.</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.rowCard,
                { borderColor: theme.border, backgroundColor: theme.card, opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/task/[id]",
                  params: {
                    id: item.id,
                    returnTo: returnTo ?? undefined,
                    filter,
                  },
                })
              }
            >
              <Text numberOfLines={2} style={[styles.taskTitle, { color: theme.foreground }]}>
                {item.title}
              </Text>
              <Text style={[styles.taskMeta, { color: theme.mutedForeground }]}>{fmt(item)}</Text>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24 },
  rowCard: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  taskTitle: { fontSize: 14, fontWeight: "700", lineHeight: 20 },
  taskMeta: { marginTop: 6, fontSize: 12 },
  empty: { padding: 14, borderRadius: 14, borderWidth: 1 },
  emptyTitle: { fontSize: 14, fontWeight: "700" },
  emptyMeta: { marginTop: 6, fontSize: 12, lineHeight: 18 },
});

