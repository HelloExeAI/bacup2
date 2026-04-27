import * as React from "react";
import { Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { KpiTile } from "@/components/KpiTile";
import { OverviewInboxBell } from "@/components/OverviewInboxBell";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/context/AuthContext";
import { useAppTheme } from "@/context/ThemeContext";
import { useUserSettings } from "@/context/UserSettingsContext";
import { todayFocusLines } from "@/lib/dayBrief";
import { localCalendarYmd } from "@/lib/mobileSettingsApi";
import { briefTaskStats } from "@/lib/taskStats";

function greetingForNow(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Good Night!";
  if (h < 12) return "Good Morning!";
  if (h < 17) return "Good Afternoon!";
  return "Good Evening!";
}

function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
  const a = (parts[0]?.[0] ?? "").toUpperCase();
  const b = (parts.length > 1 ? parts[parts.length - 1]?.[0] : "")?.toUpperCase() ?? "";
  return `${a}${b}` || "?";
}

export default function OverviewTab() {
  const { tasks, events, refreshData, session } = useAuth();
  const { theme } = useAppTheme();
  const { data: settingsData } = useUserSettings();
  const [refreshing, setRefreshing] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);

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

  const showBell = true;
  const bellBadge = false;

  const displayName = React.useMemo(() => {
    const p = settingsData?.profile;
    const dn = String(p?.display_name ?? "").trim();
    if (dn) return dn;
    const full = String(p?.name ?? "").trim();
    if (full) return full;
    return "You";
  }, [settingsData?.profile]);

  const avatarUrl = String(settingsData?.profile?.avatar_url ?? "").trim();

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
      title=""
      leading={
        <View style={styles.profileRow}>
          <View style={styles.profileLeft}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: theme.muted, borderColor: theme.border }]}>
                <Text style={[styles.avatarText, { color: theme.foreground }]}>{initialsFromName(displayName)}</Text>
              </View>
            )}
            <View style={styles.profileTextCol}>
              <Text style={[styles.greeting, { color: theme.mutedForeground }]}>{greetingForNow()}</Text>
              <Text style={[styles.profileName, { color: theme.foreground }]} numberOfLines={1}>
                {displayName}
              </Text>
            </View>
          </View>

          {showBell ? (
            <OverviewInboxBell theme={theme} showBadge={bellBadge} onPress={() => setNotifOpen(true)} />
          ) : null}
        </View>
      }
      scroll
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.accent} />
      }
    >
      <View style={[styles.sectionDivider, { backgroundColor: theme.border }]} />
      <Text style={[styles.overviewTitle, { color: theme.foreground }]}>Overview</Text>

      <View style={styles.row}>
        <KpiTile
          label="Overdue"
          value={stats.overdue}
          onPress={() => router.push({ pathname: "/(tabs)/tasks", params: { filter: "overdue", returnTo: "overview" } })}
        />
        <KpiTile
          label="Due today"
          value={stats.todaysLoad}
          onPress={() => router.push({ pathname: "/(tabs)/tasks", params: { filter: "today", returnTo: "overview" } })}
        />
      </View>
      <View style={styles.row}>
        <KpiTile
          label="Follow-ups"
          value={stats.waitingFollowups}
          onPress={() => router.push({ pathname: "/(tabs)/tasks", params: { filter: "followups", returnTo: "overview" } })}
        />
        <KpiTile
          label="Priorities"
          value={stats.activePriorities}
          onPress={() => router.push({ pathname: "/(tabs)/tasks", params: { filter: "priorities", returnTo: "overview" } })}
        />
      </View>

      <View style={[styles.briefCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
        <Text style={[styles.briefTitle, { color: theme.foreground }]}>{"Today's focus"}</Text>
        {briefLines.map((line, i) => (
          <Text key={i} style={[styles.briefLine, { color: theme.mutedForeground }]}>
            · {line}
          </Text>
        ))}
      </View>

      <View style={[styles.briefCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
        <Text style={[styles.briefTitle, { color: theme.foreground }]}>Updates</Text>
        <Text style={[styles.workSub, { color: theme.mutedForeground, marginBottom: 0 }]}>
          Evening updates from your team will appear here.
        </Text>
      </View>

      <Modal visible={notifOpen} animationType="slide" transparent onRequestClose={() => setNotifOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setNotifOpen(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: theme.foreground }]}>Inbox digest</Text>
            <Text style={[styles.modalSub, { color: theme.mutedForeground }]}>{localCalendarYmd()}</Text>
            <View style={styles.modalBlock}>
              <Text style={[styles.modalEmail, { color: theme.foreground }]}>No notifications yet</Text>
              <Text style={[styles.modalNote, { color: theme.mutedForeground }]}>
                We’ll wire multiple sources here (work inbox digest, approvals, reminders, etc.).
              </Text>
            </View>
            <Pressable
              style={[styles.modalClose, { borderColor: theme.border }]}
              onPress={() => {
                setNotifOpen(false);
                router.push("/(tabs)/messages/email");
              }}
            >
              <Text style={{ color: theme.accent, fontWeight: "800" }}>Go to Email</Text>
            </Pressable>
            <Pressable style={[styles.modalClose, { marginTop: 8, borderColor: theme.border }]} onPress={() => setNotifOpen(false)}>
              <Text style={{ color: theme.foreground, fontWeight: "700" }}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 2 },
  profileLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  profileTextCol: { flex: 1, minWidth: 0 },
  greeting: { fontSize: 11, fontWeight: "800" },
  profileName: { fontSize: 16, fontWeight: "900", marginTop: 2 },
  avatar: { width: 40, height: 40, borderRadius: 999, overflow: "hidden" },
  avatarText: { fontSize: 14, fontWeight: "900", textAlign: "center", lineHeight: 40 },
  sectionDivider: { height: StyleSheet.hairlineWidth, marginBottom: 12 },
  overviewTitle: { fontSize: 15, fontWeight: "800", letterSpacing: 0.2, marginBottom: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  briefCard: { marginTop: 14, padding: 14, borderRadius: 14, borderWidth: 1 },
  briefTitle: { fontSize: 14, fontWeight: "700", marginBottom: 8 },
  briefLine: { fontSize: 13, lineHeight: 20, marginBottom: 4 },
  workSub: { fontSize: 11, lineHeight: 16, marginBottom: 10 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 16,
    paddingBottom: 28,
  },
  modalTitle: { fontSize: 17, fontWeight: "800" },
  modalSub: { fontSize: 12, marginTop: 4, marginBottom: 12 },
  modalBlock: { marginBottom: 16 },
  modalEmail: { fontSize: 13, fontWeight: "800", marginBottom: 6 },
  modalLine: { fontSize: 13, lineHeight: 20, marginBottom: 4 },
  modalNote: { fontSize: 12, lineHeight: 18 },
  modalClose: { alignItems: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
});
