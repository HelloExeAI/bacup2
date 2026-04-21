import * as React from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { useAuth } from "@/context/AuthContext";
import { useAppTheme } from "@/context/ThemeContext";
import { getSupabase } from "@/lib/supabase";

type AccountRow = {
  id: string;
  provider: string;
  account_email: string;
  display_name: string | null;
};

export default function EmailTab() {
  const { user } = useAuth();
  const { theme } = useAppTheme();
  const [rows, setRows] = React.useState<AccountRow[]>([]);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!user?.id) return;
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb
      .from("user_connected_accounts")
      .select("id,provider,account_email,display_name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (!error && data) setRows(data as AccountRow[]);
    else setRows([]);
  }, [user?.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const label = (r: AccountRow) =>
    (r.display_name && r.display_name.trim()) || r.account_email;

  return (
    <Screen
      title="Connected email"
      subtitle="Same `user_connected_accounts` rows as Settings → Integrations on the web. OAuth tokens stay on the server."
      scroll={false}
    >
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.accent} />
        }
        ListEmptyComponent={
          <Text style={{ color: theme.mutedForeground, marginTop: 16 }}>
            No connected accounts yet. Connect Google or Microsoft on the web app.
          </Text>
        }
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => (
          <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Text style={[styles.title, { color: theme.foreground }]}>{label(item)}</Text>
            <Text style={[styles.sub, { color: theme.mutedForeground }]}>{item.account_email}</Text>
            <Text style={[styles.badge, { color: theme.accent }]}>{item.provider}</Text>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  title: { fontSize: 16, fontWeight: "700" },
  sub: { marginTop: 4, fontSize: 13 },
  badge: { marginTop: 8, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
});
