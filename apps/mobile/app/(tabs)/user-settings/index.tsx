import { Ionicons } from "@expo/vector-icons";
import * as React from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";

import { Screen } from "@/components/Screen";
import { useAuth } from "@/context/AuthContext";
import { useAppTheme } from "@/context/ThemeContext";
import { useUserSettings } from "@/context/UserSettingsContext";
import { getAppApiOrigin } from "@/lib/apiOrigin";

/**
 * Use absolute `/ (tabs)/user-settings/...` paths. Relative `./account` from this hub resolves to
 * `/(tabs)/account` (wrong) in Expo Router, causing "Unmatched Route".
 */
const LINKS: { href: Href; label: string }[] = [
  { href: "/(tabs)/user-settings/account", label: "Account" },
  { href: "/(tabs)/user-settings/preferences", label: "Preferences" },
  { href: "/(tabs)/user-settings/security", label: "Security" },
  { href: "/(tabs)/user-settings/voice", label: "Voice" },
  { href: "/(tabs)/user-settings/integrations", label: "Integrations" },
  { href: "/(tabs)/user-settings/communications", label: "Communications" },
  { href: "/(tabs)/user-settings/team-setup", label: "Team setup" },
  { href: "/(tabs)/user-settings/billing", label: "Billing" },
];

export default function SettingsHubScreen() {
  const { user, refreshData, signOut } = useAuth();
  const { scheme, setScheme, theme } = useAppTheme();
  const { error: syncErr, loading: syncLoading, refresh: refreshSettings } = useUserSettings();
  const [refreshing, setRefreshing] = React.useState(false);
  const apiOrigin = getAppApiOrigin();

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([refreshData(), refreshSettings()]);
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
      subtitle="Appearance stays on this device. Account and workspace preferences sync with the web when your app URL is configured."
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.accent} />
      }
    >
      {!apiOrigin ? (
        <View style={[styles.banner, { borderColor: theme.border, backgroundColor: theme.muted }]}>
          <Text style={[styles.bannerText, { color: theme.foreground }]}>
            Set EXPO_PUBLIC_APP_URL to your Next.js origin so mobile can load and save the same settings as the web
            app.
          </Text>
        </View>
      ) : syncErr ? (
        <View style={[styles.banner, { borderColor: "#f97316", backgroundColor: "rgba(249,115,22,0.12)" }]}>
          <Text style={[styles.bannerText, { color: theme.foreground }]}>Cloud settings: {syncErr}</Text>
        </View>
      ) : syncLoading && !refreshing ? (
        <Text style={[styles.bannerText, { color: theme.mutedForeground, marginBottom: 12 }]}>Syncing settings…</Text>
      ) : null}

      <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}>
        <Text style={[styles.label, { color: theme.mutedForeground }]}>Signed in as</Text>
        <Text style={[styles.value, { color: theme.foreground }]}>{user?.email ?? "—"}</Text>
      </View>

      <Text style={[styles.section, { color: theme.mutedForeground }]}>Workspace</Text>
      <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card, paddingVertical: 4 }]}>
        {LINKS.map((item) => (
          <Pressable
            key={item.label}
            onPress={() => router.push(item.href)}
            style={({ pressed }) => [
              styles.linkRow,
              pressed && { opacity: 0.75 },
              { borderBottomColor: theme.border },
            ]}
          >
            <Text style={[styles.linkLabel, { color: theme.foreground }]}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.mutedForeground} />
          </Pressable>
        ))}
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

      <Text style={[styles.section, { color: theme.mutedForeground }]}>Date, time & language</Text>
      <Text style={[styles.subnote, { color: theme.mutedForeground }]}>
        Open <Text style={{ fontWeight: "700", color: theme.foreground }}>Preferences</Text> for date format
        (DD-MM-YY, DD-MM-YYYY, DD-Mon-YY, …), 12h/24h clock, briefing style, and language for voice + notes.
      </Text>

      <Pressable style={[styles.signOut, { borderColor: theme.border }]} onPress={() => void onSignOut()}>
        <Text style={{ color: "#b91c1c", fontWeight: "700" }}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 12 },
  bannerText: { fontSize: 12, lineHeight: 17 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 16 },
  label: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  value: { marginTop: 5, fontSize: 14, fontWeight: "700" },
  section: { fontSize: 10, fontWeight: "800", letterSpacing: 0.7, marginBottom: 8 },
  subnote: { fontSize: 11, lineHeight: 16, marginBottom: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkLabel: { fontSize: 14, fontWeight: "700" },
  signOut: { alignSelf: "flex-start", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
});
