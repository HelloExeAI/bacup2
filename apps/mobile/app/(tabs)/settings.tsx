import * as React from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { Screen } from "@/components/Screen";
import { useAuth } from "@/context/AuthContext";
import { useAppTheme } from "@/context/ThemeContext";

export default function SettingsTab() {
  const { user, refreshData, signOut } = useAuth();
  const { scheme, setScheme, theme } = useAppTheme();
  const [refreshing, setRefreshing] = React.useState(false);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refreshData();
    } finally {
      setRefreshing(false);
    }
  }

  async function onSignOut() {
    await signOut();
    router.replace("/(auth)/sign-in");
  }

  return (
    <Screen
      title="Settings"
      subtitle="Appearance is stored on device; account data syncs with the web through Supabase."
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.accent} />
      }
    >
      <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}>
        <Text style={[styles.label, { color: theme.mutedForeground }]}>Signed in as</Text>
        <Text style={[styles.value, { color: theme.foreground }]}>{user?.email ?? "—"}</Text>
      </View>

      <Text style={[styles.section, { color: theme.mutedForeground }]}>Appearance</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => setScheme("light")}
          style={[
            styles.chip,
            { borderColor: theme.border, backgroundColor: theme.muted },
            scheme === "light" && { borderColor: theme.accent, borderWidth: 2 },
          ]}
        >
          <Text style={{ color: theme.foreground, fontWeight: "600" }}>Light</Text>
        </Pressable>
        <Pressable
          onPress={() => setScheme("dark")}
          style={[
            styles.chip,
            { borderColor: theme.border, backgroundColor: theme.muted },
            scheme === "dark" && { borderColor: theme.accent, borderWidth: 2 },
          ]}
        >
          <Text style={{ color: theme.foreground, fontWeight: "600" }}>Dark</Text>
        </Pressable>
      </View>

      <Pressable style={[styles.signOut, { borderColor: theme.border }]} onPress={() => void onSignOut()}>
        <Text style={{ color: "#b91c1c", fontWeight: "700" }}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 20 },
  label: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  value: { marginTop: 6, fontSize: 16 },
  section: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginBottom: 10 },
  row: { flexDirection: "row", gap: 10, marginBottom: 24 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  signOut: { alignSelf: "flex-start", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1 },
});
