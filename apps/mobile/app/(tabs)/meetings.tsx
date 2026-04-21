import { Ionicons } from "@expo/vector-icons";
import * as React from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

import { MeetingRecordingOverlay } from "@/components/MeetingRecordingOverlay";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/context/AuthContext";
import { useAppTheme } from "@/context/ThemeContext";
import { dateToYmd, localDayBoundsIso, ymdToLocalDate } from "@/lib/datetime";
import { getSupabase } from "@/lib/supabase";
import { ymdToday } from "@/lib/taskStats";

type MeetingRow = { id: string; content: string; created_at: string };

export default function MeetingsTab() {
  const { user, session, refreshData } = useAuth();
  const { theme, scheme } = useAppTheme();
  const [rows, setRows] = React.useState<MeetingRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [selectedYmd, setSelectedYmd] = React.useState(() => ymdToday());
  const [searchDraft, setSearchDraft] = React.useState("");
  const [searchApplied, setSearchApplied] = React.useState("");
  const [showSearch, setShowSearch] = React.useState(false);
  const [showDateModal, setShowDateModal] = React.useState(false);
  const [pickerDate, setPickerDate] = React.useState(() => ymdToLocalDate(ymdToday()));
  const [recordOpen, setRecordOpen] = React.useState(false);

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
    setSelectedYmd(dateToYmd(pickerDate));
    setShowDateModal(false);
  }

  const headerRight = (
    <View style={styles.toolbar}>
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Record meeting"
        onPress={() => setRecordOpen(true)}
        style={styles.iconBtn}
      >
        <Ionicons name="mic" size={24} color={theme.accent} />
      </Pressable>
    </View>
  );

  const isToday = selectedYmd === ymdToday();

  return (
    <>
      <Screen title="Meetings" headerRight={headerRight} scroll={false}>
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
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.preview, { color: theme.foreground }]} numberOfLines={6}>
                {item.content?.trim() || "(empty)"}
              </Text>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
          )}
        />
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
  modalTitle: { fontSize: 17, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  modalActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
});
