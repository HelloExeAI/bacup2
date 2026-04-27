import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { MessagesBackButton } from "@/components/MessagesBackButton";
import { Screen } from "@/components/Screen";
import { useAppTheme } from "@/context/ThemeContext";

export default function CommunicatorScreen() {
  const { theme } = useAppTheme();

  return (
    <Screen
      leading={<MessagesBackButton />}
      title="Communicator"
      subtitle="Workspace items that need your attention."
      scroll={false}
    >
      <View style={styles.list}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/(tabs)/team-inbox/[kind]", params: { kind: "leaves" } })}
          style={({ pressed }) => [
            styles.row,
            { borderColor: theme.border, backgroundColor: theme.card, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Ionicons name="calendar-outline" size={22} color={theme.accent} />
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: theme.foreground }]}>Leaves</Text>
            <Text style={[styles.rowSub, { color: theme.mutedForeground }]}>Pending leave approvals</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.mutedForeground} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/(tabs)/team-inbox/[kind]", params: { kind: "decisions" } })}
          style={({ pressed }) => [
            styles.row,
            { borderColor: theme.border, backgroundColor: theme.card, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Ionicons name="git-merge-outline" size={22} color={theme.accent} />
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: theme.foreground }]}>Decisions</Text>
            <Text style={[styles.rowSub, { color: theme.mutedForeground }]}>
              Pending decisions and other approvals
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.mutedForeground} />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10, marginTop: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: "700" },
  rowSub: { fontSize: 12, lineHeight: 16 },
});
