import * as React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useSaveFeedback } from "@/context/SaveFeedbackContext";
import { useUserSettings } from "@/context/UserSettingsContext";
import { useAppTheme } from "@/context/ThemeContext";
import { SaveTick } from "@/components/settings/SaveTick";
import { connectGoogleMobile, connectMicrosoftMobile } from "@/lib/mobileOAuthConnect";
import { getSupabase } from "@/lib/supabase";

export default function IntegrationsSettingsScreen() {
  const { theme } = useAppTheme();
  const { user } = useAuth();
  const { data, refresh } = useUserSettings();
  const { notifySaved } = useSaveFeedback();
  const accounts = data?.connectedAccounts ?? [];

  const [draftLabelById, setDraftLabelById] = React.useState<Record<string, string>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = React.useState<string | null>(null);

  const accountsKey = React.useMemo(() => {
    return accounts
      .map((a) => `${a.id}:${String(a.display_name ?? "")}`)
      .sort()
      .join("|");
  }, [accounts]);

  React.useEffect(() => {
    setDraftLabelById((prev) => {
      let changed = false;
      const next: Record<string, string> = { ...prev };

      const ids = new Set(accounts.map((a) => a.id));
      for (const a of accounts) {
        if (next[a.id] === undefined) {
          next[a.id] = a.display_name ?? "";
          changed = true;
        }
      }
      // Drop drafts for accounts that no longer exist.
      for (const id of Object.keys(next)) {
        if (!ids.has(id)) {
          delete next[id];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [accountsKey]);

  async function openConnectMobile(provider: "google" | "microsoft") {
    if (!user?.id) {
      Alert.alert("Not available", "Sign in again to connect an email account.");
      return;
    }
    try {
      if (provider === "google") await connectGoogleMobile(user.id);
      else await connectMicrosoftMobile(user.id);
      await refresh();
    } catch (e) {
      Alert.alert("Connect failed", e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function saveLabel(accountId: string) {
    if (!user?.id) return;
    const sb = getSupabase();
    if (!sb) {
      Alert.alert("Not available", "Supabase is not configured on this device.");
      return;
    }

    const raw = String(draftLabelById[accountId] ?? "");
    const trimmed = raw.trim();
    const nextLabel = trimmed.length ? trimmed : null;

    try {
      setSavingId(accountId);
      const { error } = await sb
        .from("user_connected_accounts")
        .update({ display_name: nextLabel })
        .eq("id", accountId)
        .eq("user_id", user.id);
      if (error) throw new Error(error.message);
      await refresh();
      notifySaved("Label saved");
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSavingId((cur) => (cur === accountId ? null : cur));
    }
  }

  async function disconnect(accountId: string) {
    if (!user?.id) return;
    const sb = getSupabase();
    if (!sb) {
      Alert.alert("Not available", "Supabase is not configured on this device.");
      return;
    }

    const acc = accounts.find((a) => a.id === accountId);
    const title = acc?.account_email ? `Disconnect ${acc.account_email}?` : "Disconnect this account?";

    Alert.alert(title, "You can reconnect later.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              setDisconnectingId(accountId);
              const { error } = await sb
                .from("user_connected_accounts")
                .delete()
                .eq("id", accountId)
                .eq("user_id", user.id);
              if (error) throw new Error(error.message);
              await refresh();
              notifySaved("Disconnected");
            } catch (e) {
              Alert.alert("Disconnect failed", e instanceof Error ? e.message : "Unknown error");
            } finally {
              setDisconnectingId((cur) => (cur === accountId ? null : cur));
            }
          })();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.p, { color: theme.mutedForeground }]}>Connect email accounts</Text>

        <View style={styles.row}>
          <Pressable
            onPress={() => void openConnectMobile("google")}
            style={[
              styles.connectBtn,
              { borderColor: theme.border, backgroundColor: theme.card },
            ]}
          >
            <Text style={{ color: theme.foreground, fontWeight: "800" }}>Connect Google</Text>
          </Pressable>
          <Pressable
            onPress={() => void openConnectMobile("microsoft")}
            style={[
              styles.connectBtn,
              { borderColor: theme.border, backgroundColor: theme.card },
            ]}
          >
            <Text style={{ color: theme.foreground, fontWeight: "800" }}>Connect Microsoft</Text>
          </Pressable>
        </View>

        {accounts.length === 0 ? (
          <Text style={{ color: theme.mutedForeground, marginTop: 8 }}>No connected accounts yet.</Text>
        ) : (
          accounts.map((a) => (
            <View key={a.id} style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <View style={styles.headerRow}>
                <Text style={[styles.email, { color: theme.foreground }]} numberOfLines={1}>
                  {a.account_email}
                </Text>
                <Pressable
                  disabled={disconnectingId === a.id}
                  accessibilityRole="button"
                  accessibilityLabel="Disconnect account"
                  onPress={() => disconnect(a.id)}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.disconnectX,
                    (pressed || disconnectingId === a.id) && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.disconnectXText}>{disconnectingId === a.id ? "…" : "✕"}</Text>
                </Pressable>
              </View>
              <Text style={[styles.provider, { color: theme.mutedForeground }]}>{a.provider}</Text>

              <View style={styles.labelRow}>
                <View style={styles.labelInputWrap}>
                  <Text style={[styles.labelHint, { color: theme.mutedForeground }]}>Label</Text>
                  <TextInput
                    value={draftLabelById[a.id] ?? ""}
                    onChangeText={(t) => setDraftLabelById((p) => ({ ...p, [a.id]: t }))}
                    placeholder="User-defined (optional)"
                    placeholderTextColor={theme.mutedForeground}
                    autoCapitalize="words"
                    style={[
                      styles.labelInput,
                      {
                        color: theme.foreground,
                        borderColor: theme.border,
                        backgroundColor: theme.background,
                      },
                    ]}
                  />
                </View>
                <SaveTick
                  theme={theme}
                  disabled={
                    savingId === a.id ||
                    String((draftLabelById[a.id] ?? "")).trim() === String(a.display_name ?? "").trim()
                  }
                  onPress={() => void saveLabel(a.id)}
                  accessibilityLabel="Save label"
                />
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 14, paddingBottom: 32 },
  p: { fontSize: 12, lineHeight: 17, marginBottom: 10, fontWeight: "800" },
  row: { flexDirection: "row", gap: 10, marginBottom: 10 },
  connectBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  card: { borderWidth: 1, borderRadius: 14, padding: 10, marginBottom: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  email: { fontSize: 14, fontWeight: "800" },
  disconnectX: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  disconnectXText: { color: "#ef4444", fontSize: 18, fontWeight: "900", lineHeight: 20 },
  provider: { marginTop: 4, textTransform: "capitalize" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  labelInputWrap: { flex: 1 },
  labelHint: { fontSize: 12, fontWeight: "800", marginBottom: 5 },
  labelInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
});
