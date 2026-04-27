import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { useAuth } from "@/context/AuthContext";
import { useAppTheme } from "@/context/ThemeContext";
import { getSupabase } from "@/lib/supabase";

type Kind = "leaves" | "decisions";

type ApprovalRow = {
  id: string;
  title: string;
  template_type: string | null;
  status: string;
  created_at: string;
};

type DecisionRow = {
  id: string;
  title: string;
  status: string;
  created_at: string;
};

export default function TeamInboxList() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const { user } = useAuth();
  const { theme } = useAppTheme();
  const k: Kind = kind === "leaves" || kind === "decisions" ? kind : "decisions";

  const [loading, setLoading] = React.useState(true);
  const [approvals, setApprovals] = React.useState<ApprovalRow[]>([]);
  const [decisions, setDecisions] = React.useState<DecisionRow[]>([]);

  const load = React.useCallback(async () => {
    const sb = getSupabase();
    const uid = user?.id;
    if (!sb || !uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (k === "leaves") {
        const { data, error } = await sb
          .from("workspace_approvals")
          .select("id,title,template_type,status,created_at")
          .eq("approver_user_id", uid)
          .eq("template_type", "leave")
          .in("status", ["pending", "needs_changes"])
          .order("updated_at", { ascending: false })
          .limit(80);
        if (error) {
          setApprovals([]);
          return;
        }
        setApprovals((data ?? []) as ApprovalRow[]);
        setDecisions([]);
        return;
      }

      const [dRes, aRes] = await Promise.all([
        sb
          .from("workspace_decisions")
          .select("id,title,status,created_at")
          .eq("status", "pending")
          .order("updated_at", { ascending: false })
          .limit(80),
        sb
          .from("workspace_approvals")
          .select("id,title,template_type,status,created_at")
          .eq("approver_user_id", uid)
          .in("status", ["pending", "needs_changes"])
          .order("updated_at", { ascending: false })
          .limit(120),
      ]);

      setDecisions(((dRes.data ?? []) as DecisionRow[]) ?? []);
      const raw = (aRes.data ?? []) as ApprovalRow[];
      setApprovals(raw.filter((r) => String(r.template_type ?? "").toLowerCase() !== "leave"));
    } finally {
      setLoading(false);
    }
  }, [k, user?.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const title = k === "leaves" ? "Leave requests" : "Decisions & approvals";
  const subtitle =
    k === "leaves"
      ? "Pending leave approvals assigned to you"
      : "Pending workspace decisions and non-leave approvals you can act on";

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

  return (
    <Screen title={title} subtitle={subtitle} headerRight={headerRight} scroll>
      {loading ? (
        <Text style={{ color: theme.mutedForeground }}>Loading…</Text>
      ) : k === "leaves" ? (
        approvals.length === 0 ? (
          <Text style={{ color: theme.mutedForeground }}>
            No pending leave requests. Organisation leave settings can be wired here later.
          </Text>
        ) : (
          approvals.map((row) => (
            <View key={row.id} style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Text style={[styles.rowTitle, { color: theme.foreground }]}>{row.title}</Text>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                {row.status} · {new Date(row.created_at).toLocaleString()}
              </Text>
            </View>
          ))
        )
      ) : (
        <>
          <Text style={[styles.section, { color: theme.mutedForeground }]}>Decisions</Text>
          {decisions.length === 0 ? (
            <Text style={[styles.empty, { color: theme.mutedForeground }]}>No pending decisions.</Text>
          ) : (
            decisions.map((row) => (
              <View key={row.id} style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}>
                <Text style={[styles.rowTitle, { color: theme.foreground }]}>{row.title}</Text>
                <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                  {row.status} · {new Date(row.created_at).toLocaleString()}
                </Text>
              </View>
            ))
          )}

          <Text style={[styles.section, { color: theme.mutedForeground, marginTop: 16 }]}>Approvals</Text>
          {approvals.length === 0 ? (
            <Text style={[styles.empty, { color: theme.mutedForeground }]}>No pending approvals.</Text>
          ) : (
            approvals.map((row) => (
              <View key={row.id} style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}>
                <Text style={[styles.rowTitle, { color: theme.foreground }]}>{row.title}</Text>
                <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                  {String(row.template_type ?? "approval")} · {row.status} · {new Date(row.created_at).toLocaleString()}
                </Text>
              </View>
            ))
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  rowTitle: { fontSize: 14, fontWeight: "700" },
  meta: { marginTop: 6, fontSize: 12 },
  empty: { fontSize: 13, marginBottom: 8 },
});
