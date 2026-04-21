import { Ionicons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import * as React from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAppTheme } from "@/context/ThemeContext";
import { getAppApiOrigin } from "@/lib/apiOrigin";
import { meetingEndLocalFromDate } from "@/lib/datetime";
import { getSupabase } from "@/lib/supabase";

type ApiTask = { id: string; title?: string };

type SpeechModule = typeof import("expo-speech-recognition");

type Props = {
  visible: boolean;
  onClose: () => void;
  session: Session | null;
  onSaved: () => void;
};

export function MeetingRecordingOverlay({ visible, onClose, session, onSaved }: Props) {
  const { theme } = useAppTheme();
  const [speech, setSpeech] = React.useState<SpeechModule | null>(null);
  const [phase, setPhase] = React.useState<
    "idle" | "countdown" | "recording" | "post" | "assign" | "saving"
  >("idle");
  const [tick, setTick] = React.useState<number | null>(null);
  const [liveTranscript, setLiveTranscript] = React.useState("");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [apiTasks, setApiTasks] = React.useState<ApiTask[]>([]);
  const [assignees, setAssignees] = React.useState<Record<string, string>>({});
  const startedAtRef = React.useRef<string>("");
  const transcriptRef = React.useRef<string>("");

  // Listen to speech native events only after the module is available (Expo Go won't have it).
  React.useEffect(() => {
    if (!speech) return;
    const subResult = (speech.ExpoSpeechRecognitionModule as any).addListener?.("result", (ev: any) => {
      const t = ev?.results?.[0]?.transcript ?? "";
      transcriptRef.current = t;
      setLiveTranscript(String(t));
    });
    const subError = (speech.ExpoSpeechRecognitionModule as any).addListener?.("error", (ev: any) => {
      if (phase === "idle" || phase === "countdown") return;
      setErrorMsg(String(ev?.message || ev?.error || "Speech recognition error"));
    });
    return () => {
      try {
        subResult?.remove?.();
        subError?.remove?.();
      } catch {
        /* noop */
      }
    };
  }, [speech, phase]);

  const reset = React.useCallback(() => {
    setPhase("idle");
    setTick(null);
    setLiveTranscript("");
    setErrorMsg(null);
    setApiTasks([]);
    setAssignees({});
    setSpeech(null);
    transcriptRef.current = "";
    startedAtRef.current = "";
  }, []);

  React.useEffect(() => {
    if (!visible) {
      reset();
      return;
    }
    let cancelled = false;
    void (async () => {
      setErrorMsg(null);
      let mod: SpeechModule | null = null;
      try {
        // Use require() so TS config doesn't need `module` supporting dynamic import.
        // Expo Go may throw here because the native module isn't bundled.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        mod = require("expo-speech-recognition") as SpeechModule;
      } catch {
        mod = null;
      }
      if (!mod) {
        setErrorMsg(
          "Meeting mic requires a development build (Expo Go can’t load native module 'ExpoSpeechRecognition').",
        );
        return;
      }
      setSpeech(mod);

      const perm = await mod.ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (cancelled) return;
      if (!perm.granted) {
        setErrorMsg("Microphone or speech recognition permission was denied.");
        return;
      }
      setPhase("countdown");
      setTick(3);
      await new Promise((r) => setTimeout(r, 1000));
      if (cancelled) return;
      setTick(2);
      await new Promise((r) => setTimeout(r, 1000));
      if (cancelled) return;
      setTick(1);
      await new Promise((r) => setTimeout(r, 1000));
      if (cancelled) return;
      setTick(null);
      startedAtRef.current = new Date().toISOString();
      transcriptRef.current = "";
      setLiveTranscript("");
      try {
        mod.ExpoSpeechRecognitionModule.start({
          lang: "en-US",
          interimResults: true,
          continuous: true,
        });
        setPhase("recording");
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Could not start speech recognition.");
      }
    })();
    return () => {
      cancelled = true;
      try {
        speech?.ExpoSpeechRecognitionModule.abort();
      } catch {
        /* noop */
      }
    };
  }, [visible, reset, speech]);

  const stopRecording = React.useCallback(async () => {
    if (phase !== "recording") return;
    try {
      speech?.ExpoSpeechRecognitionModule.stop();
    } catch {
      /* noop */
    }
    await new Promise((r) => setTimeout(r, 500));
    const transcript = transcriptRef.current.trim();
    if (!transcript) {
      setErrorMsg("No transcript captured. Try again and speak closer to the mic.");
      setPhase("idle");
      return;
    }
    setPhase("post");

    const origin = getAppApiOrigin();
    if (!origin) {
      Alert.alert(
        "API URL missing",
        "Add EXPO_PUBLIC_APP_URL to apps/mobile/.env (your Next.js app origin, e.g. https://www.thebacup.com) so meeting actions can be processed.",
      );
      setPhase("idle");
      return;
    }

    const token = session?.access_token;
    if (!token) {
      setErrorMsg("You are not signed in.");
      setPhase("idle");
      return;
    }

    const endedAt = new Date().toISOString();
    const localEnd = meetingEndLocalFromDate(new Date());

    try {
      const res = await fetch(`${origin}/api/mobile/meetings/session/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          started_at: startedAtRef.current || endedAt,
          ended_at: endedAt,
          transcript,
          calendar_title: null,
          meeting_end_local: localEnd,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string; tasks?: ApiTask[] } | null;
      if (!res.ok) {
        setErrorMsg(json?.error || `Request failed (${res.status})`);
        setPhase("idle");
        return;
      }
      const tasks = Array.isArray(json?.tasks) ? json!.tasks! : [];
      if (tasks.length === 0) {
        Alert.alert("Meeting saved", "No action items were extracted from this transcript.");
        onSaved();
        onClose();
        reset();
        return;
      }
      const nextAssign: Record<string, string> = {};
      for (const t of tasks) {
        if (t.id) nextAssign[t.id] = "";
      }
      setAssignees(nextAssign);
      setApiTasks(tasks);
      setPhase("assign");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Network error");
      setPhase("idle");
    }
  }, [phase, session?.access_token, onClose, onSaved, reset]);

  const saveAssignees = React.useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    setPhase("saving");
    try {
      for (const t of apiTasks) {
        const name = (assignees[t.id] ?? "").trim() || "self";
        const { error } = await sb.from("tasks").update({ assigned_to: name }).eq("id", t.id);
        if (error) throw new Error(error.message);
      }
      onSaved();
      onClose();
      reset();
    } catch (e) {
      Alert.alert("Could not save assignees", e instanceof Error ? e.message : "Unknown error");
      setPhase("assign");
    }
  }, [apiTasks, assignees, onClose, onSaved, reset]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {phase === "countdown" && tick != null ? (
          <View style={styles.countWrap} pointerEvents="none">
            <Text style={styles.countText}>{tick}</Text>
          </View>
        ) : null}

        {(phase === "recording" || phase === "post") && (
          <View style={[styles.panel, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.panelHeader}>
              <Text style={[styles.panelTitle, { color: theme.foreground }]}>Recording</Text>
              <Pressable onPress={() => void stopRecording()} disabled={phase === "post"} hitSlop={12}>
                <Ionicons name="stop-circle" size={36} color={phase === "post" ? theme.mutedForeground : theme.accent} />
              </Pressable>
            </View>
            <Text style={[styles.hint, { color: theme.mutedForeground }]}>Live transcript</Text>
            <ScrollView style={styles.transcriptBox}>
              <Text style={{ color: theme.foreground, fontSize: 15, lineHeight: 22 }}>
                {liveTranscript || "…"}
              </Text>
            </ScrollView>
            {phase === "post" ? (
              <View style={styles.rowCenter}>
                <ActivityIndicator color={theme.accent} />
                <Text style={{ color: theme.mutedForeground, marginLeft: 8 }}>Extracting actions…</Text>
              </View>
            ) : null}
          </View>
        )}

        {(phase === "assign" || phase === "saving") && (
          <View style={[styles.panel, { backgroundColor: theme.card, borderColor: theme.border, maxHeight: "78%" }]}>
            <Text style={[styles.panelTitle, { color: theme.foreground, marginBottom: 8 }]}>Action items</Text>
            <Text style={[styles.hint, { color: theme.mutedForeground, marginBottom: 10 }]}>
              {
                "Add an assignee for each item (or leave blank for 'self'). Tasks with due date and time appear on your calendar via the same sync as the web app."
              }
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {apiTasks.map((t) => (
                <View key={t.id} style={[styles.assignRow, { borderColor: theme.border }]}>
                  <Text style={[styles.actionTitle, { color: theme.foreground }]} numberOfLines={3}>
                    {t.title ?? "(untitled)"}
                  </Text>
                  <TextInput
                    placeholder="Assignee name"
                    placeholderTextColor={theme.mutedForeground}
                    value={assignees[t.id] ?? ""}
                    onChangeText={(v) => setAssignees((prev) => ({ ...prev, [t.id]: v }))}
                    style={[styles.input, { color: theme.foreground, borderColor: theme.border }]}
                  />
                </View>
              ))}
            </ScrollView>
            <View style={styles.footerBtns}>
              <Pressable onPress={onClose} style={styles.btnGhost}>
                <Text style={{ color: theme.mutedForeground }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void saveAssignees()}
                disabled={phase === "saving"}
                style={[styles.btnPrimary, { backgroundColor: theme.accent, opacity: phase === "saving" ? 0.6 : 1 }]}
              >
                <Text style={styles.btnPrimaryText}>{phase === "saving" ? "Saving…" : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {errorMsg ? (
          <View style={[styles.errorBanner, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={{ color: theme.foreground }}>{errorMsg}</Text>
            <Pressable onPress={onClose} style={{ marginTop: 10 }}>
              <Text style={{ color: theme.accent, fontWeight: "600" }}>Close</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 16,
  },
  countWrap: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  countText: { fontSize: 96, fontWeight: "200", color: "#ffffff" },
  panel: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    minHeight: 200,
  },
  panelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  panelTitle: { fontSize: 18, fontWeight: "700" },
  hint: { fontSize: 12, marginBottom: 6 },
  transcriptBox: { maxHeight: 220, marginTop: 4 },
  rowCenter: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  assignRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  actionTitle: { fontSize: 14, fontWeight: "600", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
  },
  footerBtns: { flexDirection: "row", justifyContent: "flex-end", gap: 16, marginTop: 12 },
  btnGhost: { paddingVertical: 10, paddingHorizontal: 12 },
  btnPrimary: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20 },
  btnPrimaryText: { color: "#fff", fontWeight: "700" },
  errorBanner: { marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1 },
});
