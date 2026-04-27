import * as React from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SaveTick } from "@/components/settings/SaveTick";
import { SettingsSelectSheet, type SettingsSelectOption } from "@/components/settings/SettingsSelectSheet";
import { ToggleRow } from "@/components/settings/ToggleRow";
import { useSaveFeedback } from "@/context/SaveFeedbackContext";
import { useUserSettings } from "@/context/UserSettingsContext";
import { useAppTheme } from "@/context/ThemeContext";
import { getAppApiOrigin } from "@/lib/apiOrigin";

const MODE_OPTIONS: SettingsSelectOption[] = [
  { value: "auto", label: "Auto" },
  { value: "manual", label: "Manual" },
];

const SENSITIVITY_OPTIONS: SettingsSelectOption[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export default function VoiceSettingsScreen() {
  const { theme } = useAppTheme();
  const { notifySaved } = useSaveFeedback();
  const { data, patch, loading } = useUserSettings();
  const api = Boolean(getAppApiOrigin());
  const [saving, setSaving] = React.useState(false);

  const [draftMode, setDraftMode] = React.useState<"auto" | "manual">("auto");
  const [draftSensitivity, setDraftSensitivity] = React.useState<"low" | "medium" | "high">("high");
  const [draftNoise, setDraftNoise] = React.useState(true);
  const [draftSpeakers, setDraftSpeakers] = React.useState(true);
  const [draftLive, setDraftLive] = React.useState(true);

  React.useEffect(() => {
    if (!data?.settings) return;
    const s = data.settings;
    setDraftMode(s.voice_input_mode);
    setDraftSensitivity(s.voice_sensitivity);
    setDraftNoise(Boolean(s.noise_suppression));
    setDraftSpeakers(Boolean(s.auto_detect_speakers));
    setDraftLive(Boolean(s.live_transcription));
  }, [data?.settings]);

  const hasChanges = React.useMemo(() => {
    const s = data?.settings;
    if (!s) return false;
    return (
      s.voice_input_mode !== draftMode ||
      s.voice_sensitivity !== draftSensitivity ||
      Boolean(s.noise_suppression) !== draftNoise ||
      Boolean(s.auto_detect_speakers) !== draftSpeakers ||
      Boolean(s.live_transcription) !== draftLive
    );
  }, [data?.settings, draftMode, draftSensitivity, draftNoise, draftSpeakers, draftLive]);

  async function onSave() {
    if (!api || !data) {
      Alert.alert("Not available", "Set EXPO_PUBLIC_APP_URL to sync voice settings.");
      return;
    }
    setSaving(true);
    try {
      await patch({
        settings: {
          voice_input_mode: draftMode,
          voice_sensitivity: draftSensitivity,
          noise_suppression: draftNoise,
          auto_detect_speakers: draftSpeakers,
          live_transcription: draftLive,
        },
      });
      notifySaved();
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </SafeAreaView>
    );
  }

  const s = data?.settings;
  if (!s) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.mutedForeground }}>Load settings from the hub first.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["bottom", "left", "right"]}>
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.pairRow}>
            <View style={styles.pairCol}>
              <Text style={[styles.label, { color: theme.mutedForeground }]}>Voice Input</Text>
              <SettingsSelectSheet
                title="Voice input mode"
                value={draftMode}
                options={MODE_OPTIONS}
                onChange={(v) => setDraftMode(v === "manual" ? "manual" : "auto")}
                theme={theme}
              />
            </View>
            <View style={styles.pairCol}>
              <Text style={[styles.label, { color: theme.mutedForeground }]}>Sensitivity</Text>
              <SettingsSelectSheet
                title="Sensitivity"
                value={draftSensitivity}
                options={SENSITIVITY_OPTIONS}
                onChange={(v) => setDraftSensitivity(v === "low" ? "low" : v === "medium" ? "medium" : "high")}
                theme={theme}
              />
            </View>
          </View>

        <ToggleRow
          label="Noise suppression"
          value={draftNoise}
          onValueChange={setDraftNoise}
        />
        <ToggleRow
          label="Auto-detect speakers"
          value={draftSpeakers}
          onValueChange={setDraftSpeakers}
        />
        <ToggleRow
          label="Live transcription"
          value={draftLive}
          onValueChange={setDraftLive}
        />
        </ScrollView>

        <View style={[styles.bottomBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <SaveTick
            disabled={!api || saving || !hasChanges}
            onPress={() => void onSave()}
            theme={theme}
            accessibilityLabel="Save voice settings"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  root: { flex: 1 },
  scroll: { padding: 14, paddingBottom: 110 },
  label: { fontSize: 10, fontWeight: "800", marginBottom: 7, marginTop: 10 },
  pairRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  pairCol: { flex: 1, minWidth: 0 },
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
