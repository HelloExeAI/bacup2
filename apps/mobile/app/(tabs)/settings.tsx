import * as React from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { Screen } from "@/components/Screen";
import { useAuth } from "@/context/AuthContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useAppTheme } from "@/context/ThemeContext";

export default function SettingsTab() {
  const { user, refreshData, signOut } = useAuth();
  const { scheme, setScheme, theme } = useAppTheme();
  const { dateFormat, timeFormat, setDateFormat, setTimeFormat } = usePreferences();
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

      <Text style={[styles.section, { color: theme.mutedForeground }]}>Date & time</Text>
      <Text style={[styles.subnote, { color: theme.mutedForeground }]}>
        Applies across mobile and web. Tasks still sync in ISO under the hood.
      </Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => setDateFormat("ymd")}
          style={[
            styles.chip,
            { borderColor: theme.border, backgroundColor: theme.muted },
            dateFormat === "ymd" && { borderColor: theme.accent, borderWidth: 2 },
          ]}
        >
          <Text style={{ color: theme.foreground, fontWeight: "600" }}>YYYY-MM-DD</Text>
        </Pressable>
        <Pressable
          onPress={() => setDateFormat("dmy")}
          style={[
            styles.chip,
            { borderColor: theme.border, backgroundColor: theme.muted },
            dateFormat === "dmy" && { borderColor: theme.accent, borderWidth: 2 },
          ]}
        >
          <Text style={{ color: theme.foreground, fontWeight: "600" }}>DD-MM-YYYY</Text>
        </Pressable>
        <Pressable
          onPress={() => setDateFormat("mdy")}
          style={[
            styles.chip,
            { borderColor: theme.border, backgroundColor: theme.muted },
            dateFormat === "mdy" && { borderColor: theme.accent, borderWidth: 2 },
          ]}
        >
          <Text style={{ color: theme.foreground, fontWeight: "600" }}>MM-DD-YYYY</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable
          onPress={() => setTimeFormat("24h")}
          style={[
            styles.chip,
            { borderColor: theme.border, backgroundColor: theme.muted },
            timeFormat === "24h" && { borderColor: theme.accent, borderWidth: 2 },
          ]}
        >
          <Text style={{ color: theme.foreground, fontWeight: "600" }}>24h</Text>
        </Pressable>
        <Pressable
          onPress={() => setTimeFormat("12h")}
          style={[
            styles.chip,
            { borderColor: theme.border, backgroundColor: theme.muted },
            timeFormat === "12h" && { borderColor: theme.accent, borderWidth: 2 },
          ]}
        >
          <Text style={{ color: theme.foreground, fontWeight: "600" }}>12h</Text>
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
  subnote: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  signOut: { alignSelf: "flex-start", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1 },
});
