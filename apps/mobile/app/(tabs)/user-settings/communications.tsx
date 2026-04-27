import * as React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SaveTick } from "@/components/settings/SaveTick";
import { SettingsSelectSheet, type SettingsSelectOption } from "@/components/settings/SettingsSelectSheet";
import { ToggleRow } from "@/components/settings/ToggleRow";
import { useSaveFeedback } from "@/context/SaveFeedbackContext";
import { useUserSettings } from "@/context/UserSettingsContext";
import { useAppTheme } from "@/context/ThemeContext";
import { getAppApiOrigin } from "@/lib/apiOrigin";
import type { NotificationSoundId } from "@/lib/settingsTypes";

const SOUNDS: NotificationSoundId[] = [
  "none",
  "notif_1",
  "notif_2",
  "notif_3",
  "notif_4",
  "notif_5",
  "notif_6",
  "notif_7",
  "notif_8",
];

const SOUND_OPTIONS: SettingsSelectOption[] = [
  { value: "none", label: "None" },
  { value: "notif_1", label: "Notification 1" },
  { value: "notif_2", label: "Notification 2" },
  { value: "notif_3", label: "Notification 3" },
  { value: "notif_4", label: "Notification 4" },
  { value: "notif_5", label: "Notification 5" },
  { value: "notif_6", label: "Notification 6" },
  { value: "notif_7", label: "Notification 7" },
  { value: "notif_8", label: "Notification 8" },
];

const FOLLOWUP_VIA_OPTIONS: SettingsSelectOption[] = [
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "Whatsapp" },
  { value: "slack", label: "Slack" },
];

const DEFAULT_BRIEF_HHMM = "08:30";

function hhmm(h: number, m: number) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function label12h(v: string) {
  const s = String(v ?? "").trim();
  const [hhRaw, mmRaw] = s.split(":");
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return s;
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

function soundPath(id: NotificationSoundId): string | null {
  if (id === "none") return null;
  const m = /^notif_(\d+)$/.exec(id);
  const n = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(n) || n < 1 || n > 8) return null;
  return `/notification-sounds/notification-${n}.mp3`;
}

export default function CommunicationsSettingsScreen() {
  const { theme } = useAppTheme();
  const { notifySaved } = useSaveFeedback();
  const { data, patch, loading } = useUserSettings();
  const api = Boolean(getAppApiOrigin());
  const [saving, setSaving] = React.useState(false);
  const [brief, setBrief] = React.useState("");
  const [subj, setSubj] = React.useState("");
  const [body, setBody] = React.useState("");
  // Locked ON (not user-configurable on mobile).
  const smart = true;
  const nudges = true;
  const overdue = true;
  const eventRem = true;
  const [channel, setChannel] = React.useState<"email" | "whatsapp" | "slack">("email");
  const [sound, setSound] = React.useState<NotificationSoundId>("none");
  const [previewing, setPreviewing] = React.useState(false);
  const soundRef = React.useRef<Audio.Sound | null>(null);

  const briefingTimeOptions = React.useMemo((): SettingsSelectOption[] => {
    const opts: SettingsSelectOption[] = [{ value: "", label: "Off" }];
    for (let h = 0; h < 24; h += 1) {
      for (let m = 0; m < 60; m += 15) {
        const v = hhmm(h, m);
        opts.push({ value: v, label: label12h(v) });
      }
    }
    return opts;
  }, []);

  React.useEffect(() => {
    return () => {
      const s = soundRef.current;
      soundRef.current = null;
      if (s) void s.unloadAsync().catch(() => null);
    };
  }, []);

  React.useEffect(() => {
    if (!data) return;
    const s = data.settings;
    setBrief(String(s.daily_briefing_notification_time ?? "").trim() || DEFAULT_BRIEF_HHMM);
    setSubj(s.followup_email_subject_template ?? "");
    setBody(s.followup_email_body_template ?? "");
    setChannel(s.followup_communication_channel);
    setSound(s.notification_sound);
  }, [data]);

  const hasChanges = React.useMemo(() => {
    const s = data?.settings;
    if (!s) return false;
    return (
      s.followup_communication_channel !== channel ||
      s.notification_sound !== sound ||
      String(s.daily_briefing_notification_time ?? "") !== brief ||
      String(s.followup_email_subject_template ?? "") !== subj ||
      String(s.followup_email_body_template ?? "") !== body
    );
  }, [data?.settings, brief, subj, body, channel, sound]);

  async function onSave() {
    if (!api || !data) {
      Alert.alert("Not available", "Set EXPO_PUBLIC_APP_URL to sync communications settings.");
      return;
    }
    setSaving(true);
    try {
      const tBrief = brief.trim();
      const normalizedBrief =
        tBrief === "" ? null : /^\d{2}:\d{2}$/.test(tBrief) ? tBrief : DEFAULT_BRIEF_HHMM;
      const next: Record<string, unknown> = {
        // Keep these ON server-side as well.
        smart_reminders: true,
        followup_nudges: true,
        overdue_alerts: true,
        event_reminders: true,
        followup_communication_channel: channel,
        notification_sound: sound,
        daily_briefing_notification_time: normalizedBrief,
      };
      // Keep existing behavior: only update templates when non-empty.
      if (subj.trim().length > 0) next.followup_email_subject_template = subj.trim();
      if (body.trim().length > 0) next.followup_email_body_template = body.trim();

      await patch({ settings: next });
      notifySaved();
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function previewSound() {
    const origin = getAppApiOrigin();
    const path = soundPath(sound);
    if (!origin || !path) return;
    if (previewing) return;
    setPreviewing(true);
    try {
      // Stop any prior sound.
      if (soundRef.current) {
        await soundRef.current.unloadAsync().catch(() => null);
        soundRef.current = null;
      }
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound: s } = await Audio.Sound.createAsync({ uri: `${origin}${path}` }, { shouldPlay: true });
      soundRef.current = s;
      // Auto-cleanup after play finishes.
      s.setOnPlaybackStatusUpdate((st) => {
        if (!st || typeof st !== "object") return;
        const done = (st as any).didJustFinish;
        if (done) {
          void s.unloadAsync().catch(() => null);
          if (soundRef.current === s) soundRef.current = null;
        }
      });
    } catch (e) {
      Alert.alert("Could not play sound", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setPreviewing(false);
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
        <Text style={{ color: theme.mutedForeground }}>Configure app URL and open Settings hub.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["bottom", "left", "right"]}>
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll}>
        <ToggleRow label="Smart reminders" value={smart} onValueChange={() => {}} disabled />
        <ToggleRow label="Follow-up nudges" value={nudges} onValueChange={() => {}} disabled />
        <ToggleRow label="Overdue alerts" value={overdue} onValueChange={() => {}} disabled />
        <ToggleRow label="Event reminders" value={eventRem} onValueChange={() => {}} disabled />

        <View style={styles.pairRow}>
          <View style={styles.pairCol}>
            <Text style={[styles.label, { color: theme.mutedForeground }]}>Daily Briefing Time</Text>
            <SettingsSelectSheet
              title="Daily Briefing Time"
              value={brief}
              options={briefingTimeOptions}
              onChange={(v) => setBrief(v)}
              theme={theme}
            />
          </View>
          <View style={styles.pairCol}>
            <Text style={[styles.label, { color: theme.mutedForeground }]}>Follow-up Via</Text>
            <SettingsSelectSheet
              title="Follow-up Via"
              value={channel}
              options={FOLLOWUP_VIA_OPTIONS}
              onChange={(v) => setChannel(v as any)}
              theme={theme}
            />
          </View>
        </View>

        <Text style={[styles.label, { color: theme.mutedForeground }]}>Notification Sound</Text>
        <View style={styles.soundRow}>
          <View style={styles.soundSelect}>
            <SettingsSelectSheet
              title="Notification Sound"
              value={sound}
              options={SOUND_OPTIONS}
              onChange={(v) => setSound(v as NotificationSoundId)}
              theme={theme}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Play notification sound"
            disabled={!api || sound === "none" || previewing}
            onPress={() => void previewSound()}
            style={({ pressed }) => [
              styles.speakerBtn,
              {
                borderColor: theme.border,
                backgroundColor: theme.card,
                opacity: !api || sound === "none" ? 0.45 : pressed || previewing ? 0.8 : 1,
              },
            ]}
          >
            <Ionicons name="volume-high" size={18} color={theme.foreground} />
          </Pressable>
        </View>

        <Text style={[styles.label, { color: theme.mutedForeground }]}>Follow-up email subject</Text>
        <TextInput
          value={subj}
          onChangeText={setSubj}
          multiline
          placeholderTextColor={theme.mutedForeground}
          style={[styles.area, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.card }]}
        />
        <Text style={[styles.label, { color: theme.mutedForeground }]}>Follow-up email body</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          multiline
          placeholderTextColor={theme.mutedForeground}
          style={[styles.areaTall, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.card }]}
        />
        </ScrollView>

        <View style={[styles.bottomBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <SaveTick
            disabled={!api || saving || !hasChanges}
            onPress={() => void onSave()}
            theme={theme}
            accessibilityLabel="Save communications"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  root: { flex: 1 },
  scroll: { padding: 14, paddingBottom: 110 },
  label: { fontSize: 10, fontWeight: "800", marginBottom: 7, marginTop: 12 },
  pairRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  pairCol: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  soundRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  soundSelect: { flex: 1, maxWidth: "50%", minWidth: 0 },
  speakerBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  input: { borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 15, marginBottom: 8 },
  area: { borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 13, minHeight: 56, textAlignVertical: "top" },
  areaTall: { borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 13, minHeight: 124, textAlignVertical: "top" },
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
