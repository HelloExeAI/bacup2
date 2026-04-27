import * as React from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SaveTick } from "@/components/settings/SaveTick";
import { SettingsSelectSheet, type SettingsSelectOption } from "@/components/settings/SettingsSelectSheet";
import { usePreferences, type DateFormat, type TimeFormat } from "@/context/PreferencesContext";
import { useSaveFeedback } from "@/context/SaveFeedbackContext";
import { useUserSettings } from "@/context/UserSettingsContext";
import { useAppTheme } from "@/context/ThemeContext";
import { getAppApiOrigin } from "@/lib/apiOrigin";
import { TRANSCRIPTION_LANGUAGE_OPTIONS } from "@/lib/transcriptionLanguages";

const DATE_OPTIONS: SettingsSelectOption[] = [
  { value: "dmy_yy", label: "DD-MM-YY" },
  { value: "dmy", label: "DD-MM-YYYY" },
  { value: "dmy_mon_yy", label: "DD-Mon-YY" },
  { value: "ymd", label: "YYYY-MM-DD" },
  { value: "mdy", label: "MM-DD-YYYY" },
];

const TIME_OPTIONS: SettingsSelectOption[] = [
  { value: "24h", label: "24-hour clock" },
  { value: "12h", label: "12-hour clock" },
];

const BRIEFING_OPTIONS: SettingsSelectOption[] = [
  { value: "ultra_concise", label: "Ultra concise" },
  { value: "standard", label: "Standard" },
];

function unifiedLanguagePatch(code: string): Record<string, unknown> {
  if (code === "multi") {
    return {
      preferred_language: "multi",
      voice_input_language: null,
      voice_output_language: "en",
    };
  }
  return {
    preferred_language: code,
    voice_input_language: code,
    voice_output_language: code,
  };
}

export default function PreferencesSettingsScreen() {
  const { theme } = useAppTheme();
  const { notifySaved } = useSaveFeedback();
  const { data, patch, loading } = useUserSettings();
  const { dateFormat, timeFormat, setDateFormat, setTimeFormat } = usePreferences();
  const api = Boolean(getAppApiOrigin());
  const [saving, setSaving] = React.useState(false);

  const [draftDate, setDraftDate] = React.useState<DateFormat>(dateFormat);
  const [draftTime, setDraftTime] = React.useState<TimeFormat>(timeFormat);
  const [draftBriefing, setDraftBriefing] = React.useState<"ultra_concise" | "standard">("standard");
  const [draftLang, setDraftLang] = React.useState<string>("en");

  React.useEffect(() => {
    setDraftDate(dateFormat);
  }, [dateFormat]);

  React.useEffect(() => {
    setDraftTime(timeFormat);
  }, [timeFormat]);

  React.useEffect(() => {
    if (!data?.settings) return;
    setDraftBriefing(data.settings.daily_briefing_style ?? "standard");
    setDraftLang(data.settings.preferred_language ?? "en");
  }, [data?.settings]);

  const langOptions = React.useMemo<SettingsSelectOption[]>(
    () =>
      TRANSCRIPTION_LANGUAGE_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
      })),
    [],
  );

  async function patchSettings(p: Record<string, unknown>) {
    if (!api || !data) {
      Alert.alert("Not available", "Set EXPO_PUBLIC_APP_URL to sync these preferences with the web app.");
      return;
    }
    try {
      await patch({ settings: p });
      notifySaved();
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Unknown error");
    }
  }

  const hasChanges =
    draftDate !== dateFormat ||
    draftTime !== timeFormat ||
    draftBriefing !== (data?.settings.daily_briefing_style ?? "standard") ||
    draftLang !== (data?.settings.preferred_language ?? "en");

  async function onSave() {
    if (!api || !data) {
      Alert.alert("Not available", "Set EXPO_PUBLIC_APP_URL to sync these preferences with the web app.");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        date_display_format: draftDate,
        clock_display_format: draftTime === "24h" ? "24h" : "12h",
        daily_briefing_style: draftBriefing,
        ...unifiedLanguagePatch(draftLang),
      };
      await patch({ settings: body });
      // Update local device formatting prefs (also upserts to Supabase; safe since we just saved).
      setDateFormat(draftDate);
      setTimeFormat(draftTime);
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["bottom", "left", "right"]}>
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.section, { color: theme.mutedForeground }]}>Date & Time</Text>

        <Text style={[styles.label, { color: theme.mutedForeground }]}>Date Format</Text>
        <SettingsSelectSheet
          title="Date format"
          value={draftDate}
          options={DATE_OPTIONS}
          onChange={(v) => setDraftDate(v as DateFormat)}
          theme={theme}
        />

        <Text style={[styles.label, { color: theme.mutedForeground }]}>Time Format</Text>
        <SettingsSelectSheet
          title="Time format"
          value={draftTime}
          options={TIME_OPTIONS}
          onChange={(v) => setDraftTime(v as TimeFormat)}
          theme={theme}
        />

        <Text style={[styles.section, { color: theme.mutedForeground }]}>Notes & Voice</Text>

        <Text style={[styles.label, { color: theme.mutedForeground }]}>Daily Briefing Style</Text>
        <SettingsSelectSheet
          title="Daily briefing style"
          value={draftBriefing}
          options={BRIEFING_OPTIONS}
          onChange={(v) => setDraftBriefing(v === "ultra_concise" ? "ultra_concise" : "standard")}
          theme={theme}
        />

        <Text style={[styles.label, { color: theme.mutedForeground }]}>Preferred Language (Notes & Voice)</Text>
        <SettingsSelectSheet
          title="Preferred language"
          value={draftLang}
          options={langOptions}
          onChange={(v) => setDraftLang(v)}
          theme={theme}
          searchable
          placeholder="Search languages…"
        />
        </ScrollView>

        <View style={[styles.bottomBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <SaveTick
            disabled={!hasChanges || saving || !api}
            onPress={() => void onSave()}
            theme={theme}
            accessibilityLabel="Save preferences"
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
  section: { fontSize: 10, fontWeight: "800", letterSpacing: 0.7, marginBottom: 6, marginTop: 10 },
  label: { fontSize: 10, fontWeight: "800", marginBottom: 6, marginTop: 8 },
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
