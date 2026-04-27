import * as React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SaveTick } from "@/components/settings/SaveTick";
import { useAuth } from "@/context/AuthContext";
import { useSaveFeedback } from "@/context/SaveFeedbackContext";
import { useUserSettings } from "@/context/UserSettingsContext";
import { useAppTheme } from "@/context/ThemeContext";
import { fetchMobileCurrentPlan, type CurrentPlanApi } from "@/lib/mobileSettingsApi";
import { getAppApiOrigin } from "@/lib/apiOrigin";
import type { BacupTierId, BillingInterval } from "@/lib/settingsTypes";

const TIER_LABEL: Record<BacupTierId, string> = {
  solo_os: "Solo OS",
  operator_os: "Operator OS",
  executive_os: "Executive OS",
};

export default function BillingSettingsScreen() {
  const { theme } = useAppTheme();
  const { notifySaved } = useSaveFeedback();
  const { session } = useAuth();
  const { data, patch: patchUser } = useUserSettings();
  const token = session?.access_token ?? null;
  const api = Boolean(getAppApiOrigin());

  const [plan, setPlan] = React.useState<CurrentPlanApi | null>(null);
  const [planErr, setPlanErr] = React.useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = React.useState(false);
  const [intervalSaving, setIntervalSaving] = React.useState(false);
  const [draftInterval, setDraftInterval] = React.useState<BillingInterval>("monthly");

  const loadPlan = React.useCallback(async () => {
    if (!api || !token) {
      setPlan(null);
      return;
    }
    setLoadingPlan(true);
    setPlanErr(null);
    try {
      setPlan(await fetchMobileCurrentPlan(token));
    } catch (e) {
      setPlan(null);
      setPlanErr(e instanceof Error ? e.message : "Failed to load usage");
    } finally {
      setLoadingPlan(false);
    }
  }, [api, token]);

  React.useEffect(() => {
    void loadPlan();
  }, [loadPlan, data?.settings.subscription_tier]);

  React.useEffect(() => {
    const s = data?.settings;
    if (!s) return;
    setDraftInterval(s.billing_interval ?? "monthly");
  }, [data?.settings]);

  const hasChanges = React.useMemo(() => {
    const cur = data?.settings.billing_interval ?? "monthly";
    return cur !== draftInterval;
  }, [data?.settings.billing_interval, draftInterval]);

  async function onSaveInterval() {
    if (!api || !data) {
      Alert.alert("Not available", "Set EXPO_PUBLIC_APP_URL first.");
      return;
    }
    setIntervalSaving(true);
    try {
      await patchUser({ settings: { billing_interval: draftInterval } });
      await loadPlan();
      notifySaved();
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIntervalSaving(false);
    }
  }

  if (!api || !token) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.mutedForeground, textAlign: "center", paddingHorizontal: 24 }}>
          Set EXPO_PUBLIC_APP_URL to view billing and usage from the same API as the web app.
        </Text>
      </SafeAreaView>
    );
  }

  const s = data?.settings;
  const currentTier = plan?.plan ?? s?.subscription_tier ?? "solo_os";
  const status = plan?.status ?? s?.subscription_status ?? "active";
  const nextBilling = plan?.nextBillingDate ?? s?.current_period_end ?? null;
  const billingInterval = plan?.billingInterval ?? s?.billing_interval ?? "monthly";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["bottom", "left", "right"]}>
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.p, { color: theme.mutedForeground }]}>
          Plan changes and checkout run in the web app. Here you can see the same tier, renewal date, and usage snapshot
          as Settings → Billing on the web.
        </Text>

        <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={[styles.h, { color: theme.foreground }]}>Current plan</Text>
          <Text style={{ color: theme.foreground, fontSize: 18, fontWeight: "900", marginTop: 6 }}>
            {TIER_LABEL[currentTier] ?? currentTier}
          </Text>
          <Text style={{ color: theme.mutedForeground, marginTop: 4 }}>Status: {status}</Text>
          {nextBilling ? (
            <Text style={{ color: theme.mutedForeground, marginTop: 4 }}>Next period end: {nextBilling}</Text>
          ) : null}
        </View>

        <Text style={[styles.h, { color: theme.foreground }]}>Billing interval</Text>
        <View style={styles.row}>
          {(["monthly", "yearly"] as const).map((v) => (
            <Pressable
              key={v}
              disabled={intervalSaving}
              onPress={() => setDraftInterval(v)}
              style={[
                styles.chip,
                { borderColor: theme.border, backgroundColor: theme.muted },
                draftInterval === v && { borderColor: theme.accent, borderWidth: 2 },
              ]}
            >
              <Text style={{ color: theme.foreground, fontWeight: "700", textTransform: "capitalize" }}>{v}</Text>
            </Pressable>
          ))}
        </View>

        {loadingPlan ? (
          <ActivityIndicator color={theme.accent} style={{ marginTop: 16 }} />
        ) : planErr ? (
          <Text style={{ color: "#b91c1c", marginTop: 12 }}>{planErr}</Text>
        ) : plan ? (
          <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Text style={[styles.h, { color: theme.foreground }]}>Usage (this period)</Text>
            <Text style={{ color: theme.mutedForeground, marginTop: 6 }}>
              AI tokens: {plan.usage.aiTokens} / {plan.usage.aiTokensLimit}
            </Text>
            <Text style={{ color: theme.mutedForeground, marginTop: 4 }}>
              Voice minutes: {plan.usage.voiceMinutes} / {plan.usage.voiceMinutesLimit}
            </Text>
            <Text style={{ color: theme.mutedForeground, marginTop: 4 }}>Period: {plan.periodKey}</Text>
            <Text style={{ color: theme.mutedForeground, marginTop: 4 }}>Resets: {plan.resetsAtIso}</Text>
          </View>
        ) : null}

        <Pressable onPress={() => void loadPlan()} style={{ marginTop: 16 }}>
          <Text style={{ color: theme.accent, fontWeight: "700" }}>Refresh usage</Text>
        </Pressable>
        </ScrollView>

        <View style={[styles.bottomBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <SaveTick
            disabled={!api || intervalSaving || !hasChanges}
            onPress={() => void onSaveInterval()}
            theme={theme}
            accessibilityLabel="Save billing interval"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  root: { flex: 1 },
  scroll: { padding: 14, paddingBottom: 110 },
  p: { fontSize: 12, lineHeight: 17, marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  h: { fontSize: 13, fontWeight: "800" },
  row: { flexDirection: "row", gap: 10, marginTop: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
