import * as React from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { KpiTile } from "@/components/KpiTile";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/context/AuthContext";
import { useAppTheme } from "@/context/ThemeContext";
import { useUserSettings } from "@/context/UserSettingsContext";
import { getSupabase } from "@/lib/supabase";
import { briefTaskStats } from "@/lib/taskStats";

/** Consolidated operational view: same task universe as Overview + assignee grouping (web Workspace hub is richer). */
export default function ConsolidatedTab() {
  const { tasks, refreshData, user } = useAuth();
  const { theme } = useAppTheme();
  const { data: settingsData } = useUserSettings();
  const [refreshing, setRefreshing] = React.useState(false);
  const [leavePending, setLeavePending] = React.useState(0);
  const [decisionsPending, setDecisionsPending] = React.useState(0);

  const stats = React.useMemo(() => briefTaskStats(tasks), [tasks]);

  const myDisplayName = React.useMemo(() => {
    const p = settingsData?.profile;
    const dn = String((p as any)?.display_name ?? "").trim();
    if (dn) return dn;
    const full = String((p as any)?.name ?? "").trim();
    return full || "You";
  }, [settingsData?.profile]);

  const byAssignee = React.useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();

    // Always show these rows (even if count is 0).
    map.set("unassigned", { label: "Unassigned", count: 0 });
    map.set("self", { label: "self", count: 0 });

    for (const t of tasks) {
      if (t.status !== "pending") continue;
      const raw = String((t as any).assigned_to ?? "").trim() || "Unassigned";
      const key = raw.toLowerCase();
      const prev = map.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        map.set(key, { label: raw, count: 1 });
      }
    }

    const rows = [...map.entries()].map(([key, v]) => {
      const labelLower = v.label.toLowerCase();
      const isUnassigned = labelLower === "unassigned";
      const isSelf = labelLower === "self";
      return {
        key,
        count: v.count,
        // UI labels
        label: isUnassigned ? "Unassigned" : isSelf ? myDisplayName : v.label,
        // Keep route params compatible with existing setup.
        routeName: isSelf ? "self" : key,
        isUnassigned,
        isSelf,
      };
    });

    const unassigned = rows.find((r) => r.isUnassigned) ?? null;
    const self = rows.find((r) => r.isSelf) ?? null;
    const others = rows
      .filter((r) => !r.isUnassigned && !r.isSelf)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

    const ordered = [unassigned, self, ...others].filter(Boolean).slice(0, 20) as typeof rows;
    return ordered;
  }, [tasks, myDisplayName]);

  const loadApproverKpis = React.useCallback(async () => {
    const sb = getSupabase();
    const uid = user?.id;
    if (!sb || !uid) {
      setLeavePending(0);
      setDecisionsPending(0);
      return;
    }

    const [{ count: leaveCnt }, { count: decCnt }, { data: pendingApr }] = await Promise.all([
      sb
        .from("workspace_approvals")
        .select("id", { count: "exact", head: true })
        .eq("approver_user_id", uid)
        .eq("template_type", "leave")
        .in("status", ["pending", "needs_changes"]),
      sb.from("workspace_decisions").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sb
        .from("workspace_approvals")
        .select("id,template_type")
        .eq("approver_user_id", uid)
        .in("status", ["pending", "needs_changes"])
        .limit(200),
    ]);

    const otherApr = (pendingApr ?? []).filter((r: { template_type?: string | null }) => {
      return String(r.template_type ?? "").toLowerCase() !== "leave";
    }).length;

    setLeavePending(leaveCnt ?? 0);
    setDecisionsPending((decCnt ?? 0) + otherApr);
  }, [user?.id]);

  React.useEffect(() => {
    void loadApproverKpis();
  }, [loadApproverKpis]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refreshData();
      await loadApproverKpis();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Screen
      title="Team View"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.accent} />
      }
    >
      <View style={styles.row}>
        <KpiTile
          label="Pending"
          value={stats.pendingTotal}
          onPress={() => router.push({ pathname: "/(tabs)/tasks", params: { filter: "pending", returnTo: "team" } })}
        />
        <KpiTile
          label="Overdue"
          value={stats.overdue}
          onPress={() => router.push({ pathname: "/(tabs)/tasks", params: { filter: "overdue", returnTo: "team" } })}
        />
      </View>
      <Text style={[styles.section, { color: theme.mutedForeground }]}>Inbox</Text>
      <View style={styles.row}>
        <KpiTile
          label="Leaves"
          value={leavePending}
          onPress={() => router.push({ pathname: "/(tabs)/team-inbox/[kind]", params: { kind: "leaves" } })}
        />
        <KpiTile
          label="Decisions"
          value={decisionsPending}
          onPress={() => router.push({ pathname: "/(tabs)/team-inbox/[kind]", params: { kind: "decisions" } })}
        />
      </View>
      <Text style={[styles.section, { color: theme.mutedForeground }]}>Team list</Text>
      {byAssignee.length === 0 ? (
        <Text style={{ color: theme.mutedForeground }}>No pending tasks.</Text>
      ) : (
        byAssignee.map((v) => (
          <Pressable
            key={v.key}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/(tabs)/assignee/[name]", params: { name: v.routeName } })}
            style={({ pressed }) => [
              styles.rowItem,
              { borderColor: theme.border, backgroundColor: theme.card, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.assignee, { color: theme.foreground }]} numberOfLines={1}>
              {v.label}
            </Text>
            <Text style={[styles.count, { color: theme.mutedForeground }]}>{v.count}</Text>
          </Pressable>
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
