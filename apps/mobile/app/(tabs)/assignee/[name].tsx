import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { useAuth, type TaskRow } from "@/context/AuthContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useAppTheme } from "@/context/ThemeContext";
import { formatDate, formatTime } from "@/lib/dateTimePrefs";

function normalizeAssignee(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

export default function AssigneeTasksScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const { tasks } = useAuth();
  const { theme } = useAppTheme();
  const { dateFormat, timeFormat } = usePreferences();

  const key = normalizeAssignee(name);

  const data = React.useMemo(() => {
    const pending = tasks.filter((t) => t.status === "pending");
    return pending.filter((t) => normalizeAssignee((t as any).assigned_to || "unassigned") === key);
  }, [tasks, key]);

  const title = React.useMemo(() => {
    const sample = data[0] as any;
    const label = String(sample?.assigned_to ?? "").trim();
    return label || (key === "unassigned" ? "Unassigned" : key);
  }, [data, key]);

  const headerRight = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      onPress={() => router.back()}
      style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.7 : 1 }]}
    >
      <Ionicons name="close" size={18} color={theme.foreground} />
    </Pressable>
  );

  function dueLabel(t: Pick<TaskRow, "due_date" | "due_time">) {
    const d = formatDate(t.due_date, dateFormat);
    const time = formatTime(String(t.due_time ?? "").slice(0, 5), timeFormat).trim();
    return time ? `${d} · ${time}` : d;
  }

  return (
    <Screen title={title} subtitle={`${data.length} task${data.length === 1 ? "" : "s"}`} headerRight={headerRight} scroll>
      {data.length === 0 ? (
        <Text style={{ color: theme.mutedForeground }}>No pending tasks.</Text>
      ) : (
        data.map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/(tabs)/task/[id]",
                params: { id: t.id, returnTo: "assignee", assignee: String(name ?? "") },
              })
            }
            style={({ pressed }) => [
              styles.rowCard,
              { borderColor: theme.border, backgroundColor: theme.card, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={2} style={[styles.taskTitle, { color: theme.foreground }]}>
                {t.title}
              </Text>
              <Text style={[styles.taskMeta, { color: theme.mutedForeground }]}>{dueLabel(t)}</Text>
            </View>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowCard: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  taskTitle: { fontSize: 14, fontWeight: "700", lineHeight: 20 },
  taskMeta: { marginTop: 6, fontSize: 12 },
});

