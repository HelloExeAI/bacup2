import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { useAppTheme } from "@/context/ThemeContext";

export default function MessagesHub() {
  const { theme } = useAppTheme();

  return (
    <Screen title="Messages" subtitle="Choose Communicator or Email." scroll={false}>
      <View style={styles.grid}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(tabs)/messages/communicator")}
          style={({ pressed }) => [
            styles.tile,
            { borderColor: theme.border, backgroundColor: theme.card, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Ionicons name="chatbubbles-outline" size={28} color={theme.accent} />
          <Text style={[styles.tileTitle, { color: theme.foreground }]}>Communicator</Text>
          <Text style={[styles.tileSub, { color: theme.mutedForeground }]}>
            Team leaves, decisions, and approvals.
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(tabs)/messages/email")}
          style={({ pressed }) => [
            styles.tile,
            { borderColor: theme.border, backgroundColor: theme.card, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Ionicons name="mail-outline" size={28} color={theme.accent} />
          <Text style={[styles.tileTitle, { color: theme.foreground }]}>Email</Text>
          <Text style={[styles.tileSub, { color: theme.mutedForeground }]}>
            Connected accounts and today’s inbox.
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 12, marginTop: 8 },
  tile: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  tileTitle: { fontSize: 17, fontWeight: "700", marginTop: 4 },
  tileSub: { fontSize: 13, lineHeight: 18 },
});
