import { Ionicons } from "@expo/vector-icons";
import * as React from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MeetingRecordingOverlay } from "@/components/MeetingRecordingOverlay";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/context/AuthContext";
import { useAppTheme } from "@/context/ThemeContext";
import { getAppApiOrigin } from "@/lib/apiOrigin";
import { dateToYmd, localDayBoundsIso, ymdToLocalDate } from "@/lib/datetime";
import { getSupabase } from "@/lib/supabase";
import { ymdToday } from "@/lib/taskStats";

type MeetingRow = { id: string; content: string; created_at: string };

type MeetingSummaryPayload = {
  summary: string;
  decisions: string[];
  actionItems: string[];
  source: string;
};

function stripTranscriptHeader(raw: string): string {
  const t = String(raw ?? "");
  const lines = t.split("\n");
  if (lines.length >= 2 && /^Transcript\s*\(/i.test(lines[0])) {
    // Drop the first line and one optional blank line after it.
    let start = 1;
    if (lines[1]?.trim() === "") start = 2;
    return lines.slice(start).join("\n").trim();
  }
  return t.trim();
}

export default function MeetingsTab() {
  const { user, session, refreshData } = useAuth();
  const { theme, scheme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = React.useState<MeetingRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [selectedYmd, setSelectedYmd] = React.useState(() => ymdToday());
  const [datePicked, setDatePicked] = React.useState(false);
  const [searchDraft, setSearchDraft] = React.useState("");
  const [searchApplied, setSearchApplied] = React.useState("");
  const [showSearch, setShowSearch] = React.useState(false);
  const [showDateModal, setShowDateModal] = React.useState(false);
  const [pickerDate, setPickerDate] = React.useState(() => ymdToLocalDate(ymdToday()));
  const [recordOpen, setRecordOpen] = React.useState(false);

  const [noteOpen, setNoteOpen] = React.useState(false);
  const [noteText, setNoteText] = React.useState("");
  const [noteErr, setNoteErr] = React.useState<string | null>(null);
  const [noteLoading, setNoteLoading] = React.useState(false);
  const [noteTranscriptId, setNoteTranscriptId] = React.useState<string | null>(null);

  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiErr, setAiErr] = React.useState<string | null>(null);
  const [aiData, setAiData] = React.useState<MeetingSummaryPayload | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setSearchApplied(searchDraft.trim()), 320);
    return () => clearTimeout(t);
  }, [searchDraft]);

  const load = React.useCallback(async () => {
    if (!user?.id) return;
    const sb = getSupabase();
    if (!sb) return;
    const { startIso, endIso } = localDayBoundsIso(selectedYmd);
    let q = sb
      .from("notes")
      .select("id,content,created_at")
      .eq("user_id", user.id)
      .eq("type", "meeting")
      .is("parent_id", null)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(120);
    if (searchApplied) {
      q = q.ilike("content", `%${searchApplied}%`);
    }
    const { data, error } = await q;
    if (!error && data) setRows(data as MeetingRow[]);
    else setRows([]);
  }, [user?.id, selectedYmd, searchApplied]);

  React.useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  function openDatePicker() {
    setPickerDate(ymdToLocalDate(selectedYmd));
    setShowDateModal(true);
  }

  function confirmDate() {
    const next = dateToYmd(pickerDate);
    setSelectedYmd(next);
    setDatePicked(next !== ymdToday());
    setShowDateModal(false);
  }

  function jumpToToday() {
    setSelectedYmd(ymdToday());
    setDatePicked(false);
    setShowDateModal(false);
  }

  const isToday = selectedYmd === ymdToday();

  const headerRight = (
    <View style={styles.toolbar}>
      {datePicked && !isToday ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go to today"
          onPress={jumpToToday}
          style={({ pressed }) => [styles.todayChip, pressed && { opacity: 0.8 }]}
        >
          <Text style={[styles.todayChipText, { color: theme.foreground }]}>Today</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose date"
        onPress={openDatePicker}
        style={styles.iconBtn}
      >
        <Ionicons name="calendar-outline" size={22} color={theme.foreground} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search meetings"
        onPress={() => setShowSearch((s) => !s)}
        style={styles.iconBtn}
      >
        <Ionicons name="search-outline" size={22} color={theme.foreground} />
      </Pressable>
    </View>
  );

  const openNote = React.useCallback(
    async (id: string, createdAtIso: string) => {
      if (!user?.id) return;
      const sb = getSupabase();
      if (!sb) return;
      setNoteOpen(true);
      setNoteErr(null);
      setNoteLoading(true);
      setNoteText("");
      setNoteTranscriptId(null);
      setAiData(null);
      setAiErr(null);
      setAiLoading(false);
      try {
        // Meeting list rows are the parent note (type="meeting") with a short title.
        // Full transcript is stored as a child note: type="meeting_transcript", parent_id=<meeting id>.
        const { data: transcriptRow, error: tErr } = await sb
          .from("notes")
          .select("id,content,created_at")
          .eq("user_id", user.id)
          .eq("parent_id", id)
          .eq("type", "meeting_transcript")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (tErr) throw new Error(tErr.message);
        if (transcriptRow?.content) {
          const tid = String((transcriptRow as any).id ?? "");
          setNoteTranscriptId(tid || null);
          setNoteText(stripTranscriptHeader(String((transcriptRow as any).content ?? "")));
          return;
        }

        const { data, error } = await sb
          .from("notes")
          .select("id,content,created_at")
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Meeting note not found.");
        setNoteText(String((data as any).content ?? "").trim());
      } catch (e) {
        setNoteErr(e instanceof Error ? e.message : "Could not load meeting note.");
      } finally {
        setNoteLoading(false);
      }
    },
    [user?.id],
  );

  React.useEffect(() => {
    if (!noteOpen) return;
    const token = session?.access_token ?? "";
    const origin = getAppApiOrigin();
    if (!token || !origin || !noteTranscriptId) return;

    let cancelled = false;
    setAiLoading(true);
    setAiErr(null);
    setAiData(null);
    void (async () => {
      try {
        const res = await fetch(
          `${origin}/api/mobile/meetings/note/summary?noteId=${encodeURIComponent(noteTranscriptId)}`,
          { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" },
        );
        const j = (await res.json().catch(() => null)) as any;
        if (cancelled) return;
        if (!res.ok) throw new Error(String(j?.error || `Summary failed (${res.status})`));
        setAiData({
          summary: String(j?.summary ?? ""),
          decisions: Array.isArray(j?.decisions) ? j.decisions.map(String) : [],
          actionItems: Array.isArray(j?.actionItems) ? j.actionItems.map(String) : [],
          source: String(j?.source ?? "unknown"),
        });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Could not load summary.";
        if (msg.toLowerCase().includes("network request failed")) {
          setAiErr(
            `Network request failed. Could not reach ${origin}. Make sure the Next.js server is running and your phone is on the same Wi‑Fi.`,
          );
        } else {
          setAiErr(msg);
        }
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noteOpen, noteTranscriptId, session?.access_token]);

  return (
    <>
      <Screen title="Meeting Notes" headerRight={headerRight} scroll={false}>
        {showSearch ? (
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder="Search by keyword…"
            placeholderTextColor={theme.mutedForeground}
            style={[
              styles.searchInput,
              { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.card },
            ]}
          />
        ) : null}
        <Text style={[styles.dayLabel, { color: theme.mutedForeground }]}>
          {isToday ? "Today" : selectedYmd}
          {searchApplied ? ` · matching “${searchApplied}”` : ""}
        </Text>
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.accent} />
          }
          ListEmptyComponent={
            <Text style={{ color: theme.mutedForeground, marginTop: 24 }}>
              {loading ? "Loading…" : "No meetings for this day."}
            </Text>
          }
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => void openNote(item.id, item.created_at)}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <Text style={[styles.preview, { color: theme.foreground }]} numberOfLines={6}>
                {item.content?.trim() || "(empty)"}
              </Text>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </Pressable>
          )}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Record meeting"
          onPress={() => setRecordOpen(true)}
          style={({ pressed }) => [
            styles.micFab,
            { backgroundColor: theme.accent, bottom: 8 + Math.max(insets.bottom, 8) + 22 },
            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Ionicons name="mic" size={22} color="#fff" />
        </Pressable>
      </Screen>

      <Modal visible={showDateModal} transparent animationType="fade" onRequestClose={() => setShowDateModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowDateModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.foreground }]}>Pick a day</Text>
            <DateTimePicker
              value={pickerDate}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_, d) => {
                if (d) setPickerDate(d);
              }}
              themeVariant={scheme === "dark" ? "dark" : "light"}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowDateModal(false)}>
                <Text style={{ color: theme.mutedForeground }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={confirmDate}>
                <Text style={{ color: theme.accent, fontWeight: "700" }}>Apply</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={noteOpen} animationType="slide" onRequestClose={() => setNoteOpen(false)}>
        <Screen
          title="Meeting Details"
          leading={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => setNoteOpen(false)}
              hitSlop={10}
              style={styles.backRow}
            >
              <Ionicons name="chevron-back" size={18} color={theme.foreground} />
              <Text style={[styles.backText, { color: theme.foreground }]}>Back</Text>
            </Pressable>
          }
          scroll={false}
        >
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {noteErr ? <Text style={styles.err}>{noteErr}</Text> : null}
            {noteLoading ? <Text style={{ color: theme.mutedForeground }}>Loading…</Text> : null}
            {!noteLoading && !noteErr ? (
              <View style={[styles.noteCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.noteSectionTitle, { color: theme.foreground }]}>Transcript</Text>
                <Text style={[styles.noteBody, { color: theme.foreground }]} selectable>
                  {noteText.trim() || "(empty)"}
                </Text>
              </View>
            ) : null}

            {!noteLoading && !noteErr ? (
              <View style={[styles.noteCard, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 12 }]}>
                <Text style={[styles.noteSectionTitle, { color: theme.foreground }]}>Summary</Text>
                {aiLoading ? (
                  <Text style={{ color: theme.mutedForeground }}>Generating…</Text>
                ) : aiErr ? (
                  <Text style={{ color: theme.mutedForeground }}>{aiErr}</Text>
                ) : aiData ? (
                  <>
                    {aiData.summary ? (
                      <Text style={[styles.noteBody, { color: theme.foreground }]}>{aiData.summary}</Text>
                    ) : (
                      <Text style={{ color: theme.mutedForeground }}>No summary yet.</Text>
                    )}

                    <Text style={[styles.noteSubTitle, { color: theme.foreground }]}>Decisions</Text>
                    {aiData.decisions.length ? (
                      aiData.decisions.map((d, i) => (
                        <Text key={`d-${i}`} style={[styles.bullet, { color: theme.mutedForeground }]}>
                          · {d}
                        </Text>
                      ))
                    ) : (
                      <Text style={{ color: theme.mutedForeground }}>None</Text>
                    )}

                    <Text style={[styles.noteSubTitle, { color: theme.foreground }]}>Action items</Text>
                    {aiData.actionItems.length ? (
                      aiData.actionItems.map((a, i) => (
                        <Text key={`a-${i}`} style={[styles.bullet, { color: theme.mutedForeground }]}>
                          · {a}
                        </Text>
                      ))
                    ) : (
                      <Text style={{ color: theme.mutedForeground }}>None</Text>
                    )}

                    <Text style={[styles.disclaimer, { color: theme.mutedForeground }]}>
                      Disclaimer: This is voice recognition, and due to differences in slang, there may be variation in voice capture.
                    </Text>
                  </>
                ) : (
                  <Text style={{ color: theme.mutedForeground }}>
                    Summary will appear here once available.
                  </Text>
                )}
              </View>
            ) : null}
          </ScrollView>
        </Screen>
      </Modal>

      <MeetingRecordingOverlay
        visible={recordOpen}
        onClose={() => setRecordOpen(false)}
        session={session}
        onSaved={() => {
          void refreshData();
          void load();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row", alignItems: "center" },
  iconBtn: { padding: 8 },
  todayChip: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 999, marginRight: 0 },
  todayChipText: { fontSize: 12, fontWeight: "800" },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 15,
  },
  dayLabel: { fontSize: 12, marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  preview: { fontSize: 14, lineHeight: 20 },
  meta: { marginTop: 8, fontSize: 11 },
  micFab: {
    position: "absolute",
    left: "50%",
    marginLeft: -28,
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
  modalTitle: { fontSize: 17, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  modalActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  backText: { fontSize: 13, fontWeight: "800" },
  err: { color: "#b91c1c", marginBottom: 10 },
  noteCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  noteSectionTitle: { fontSize: 14, fontWeight: "800", marginBottom: 10 },
  noteSubTitle: { fontSize: 13, fontWeight: "800", marginTop: 12, marginBottom: 6 },
  noteBody: { fontSize: 14, lineHeight: 21 },
  bullet: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
  disclaimer: { marginTop: 14, fontSize: 12, lineHeight: 16 },
});
