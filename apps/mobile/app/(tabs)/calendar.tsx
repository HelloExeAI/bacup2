import { Ionicons } from "@expo/vector-icons";
import * as React from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Screen } from "@/components/Screen";
import { useAuth } from "@/context/AuthContext";
import { useAppTheme } from "@/context/ThemeContext";
import { getAppApiOrigin } from "@/lib/apiOrigin";
import { getSupabase } from "@/lib/supabase";
import { ymdToday } from "@/lib/taskStats";

type TimelineItem =
  | {
      kind: "task";
      id: string;
      title: string;
      due_time: string | null;
      type?: string | null;
      assigned_to?: string | null;
      status: string;
    }
  | {
      kind: "event";
      id: string;
      title: string;
      time: string | null;
      provider?: string | null;
    };

function fmtTime(t: string | null | undefined) {
  if (!t) return "—";
  return String(t).slice(0, 5);
}

function sortKeyTime(t: string | null | undefined) {
  if (!t) return "99:99";
  return String(t).slice(0, 5);
}

function ymdToLocalDate(ymd: string) {
  // Interpret YYYY-MM-DD as a local day (not UTC) to match user expectations.
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

function formatAgendaHeader(ymd: string) {
  const dt = ymdToLocalDate(ymd);
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(dt);
  const dayMonth = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(dt);
  return { weekday, dayMonth };
}

export default function CalendarTab() {
  const { tasks, events, refreshData, user, session } = useAuth();
  const { theme } = useAppTheme();
  const [refreshing, setRefreshing] = React.useState(false);

  const today = React.useMemo(() => ymdToday(), []);

  const [remoteEvents, setRemoteEvents] = React.useState<Array<{ id: string; title: string; time: string | null; provider?: string }>>(
    [],
  );

  const [createOpen, setCreateOpen] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<TimelineItem | null>(null);

  const [draftTitle, setDraftTitle] = React.useState("");
  const [draftTime, setDraftTime] = React.useState("09:00");
  const [draftType, setDraftType] = React.useState<"todo" | "followup" | "reminder">("todo");
  const [draftAssignee, setDraftAssignee] = React.useState("");

  const items = React.useMemo<TimelineItem[]>(() => {
    const taskById = new Map(tasks.map((t) => [t.id, t]));

    const list: TimelineItem[] = [];

    for (const t of tasks) {
      if (t.status !== "pending") continue;
      if (t.due_date !== today) continue;
      list.push({
        kind: "task",
        id: t.id,
        title: t.title,
        due_time: t.due_time ?? null,
        type: t.type ?? null,
        assigned_to: (t as any).assigned_to ?? null,
        status: t.status,
      });
    }

    for (const e of events) {
      if (e.date !== today) continue;
      const linked = e.linked_task_id ? taskById.get(String(e.linked_task_id)) : null;
      if (linked) {
        // If it’s linked, the task already represents this item.
        continue;
      }
      list.push({
        kind: "event",
        id: e.id,
        title: (e.title ?? "Untitled").trim() || "Untitled",
        time: e.time ?? null,
        provider: "local",
      });
    }

    for (const e of remoteEvents) {
      list.push({
        kind: "event",
        id: e.id,
        title: (e.title ?? "Untitled").trim() || "Untitled",
        time: e.time ?? null,
        provider: e.provider ?? "calendar",
      });
    }

    list.sort((a, b) => {
      const ak = a.kind === "task" ? sortKeyTime(a.due_time) : sortKeyTime(a.time);
      const bk = b.kind === "task" ? sortKeyTime(b.due_time) : sortKeyTime(b.time);
      return ak.localeCompare(bk) || a.title.localeCompare(b.title);
    });
    return list;
  }, [tasks, events, remoteEvents, today]);

  const loadRemote = React.useCallback(async () => {
    const token = session?.access_token ?? "";
    const origin = getAppApiOrigin();
    if (!token || !origin) {
      setRemoteEvents([]);
      return;
    }
    try {
      const tzOffsetMinutes = new Date().getTimezoneOffset();
      const res = await fetch(
        `${origin}/api/mobile/calendar/today?date=${encodeURIComponent(today)}&tzOffsetMinutes=${encodeURIComponent(String(tzOffsetMinutes))}`,
        {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
        },
      );
      const j = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        setRemoteEvents([]);
        return;
      }
      const rows = Array.isArray(j?.events) ? j.events : [];
      setRemoteEvents(
        rows
          .filter((x: any) => x && typeof x === "object")
          .map((x: any) => ({
            id: String(x.id ?? ""),
            title: String(x.title ?? ""),
            time: x.time == null ? null : String(x.time),
            provider: String(x.provider ?? "google"),
          }))
          .filter((x: any) => x.id && x.title),
      );
    } catch {
      setRemoteEvents([]);
    }
  }, [session?.access_token, today]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([refreshData(), loadRemote()]);
    } finally {
      setRefreshing(false);
    }
  }

  React.useEffect(() => {
    void loadRemote();
  }, [loadRemote]);

  function openCreate() {
    setDraftTitle("");
    setDraftTime("09:00");
    setDraftType("todo");
    setDraftAssignee("");
    setCreateOpen(true);
  }

  function openDetails(item: TimelineItem) {
    setSelected(item);
    if (item.kind === "task") {
      setDraftTitle(item.title);
      setDraftTime(item.due_time ? String(item.due_time).slice(0, 5) : "09:00");
      setDraftType((item.type === "followup" || item.type === "reminder" ? item.type : "todo") as any);
      setDraftAssignee(item.assigned_to ? String(item.assigned_to) : "");
    } else {
      setDraftTitle(item.title);
      setDraftTime(item.time ? String(item.time).slice(0, 5) : "09:00");
      setDraftType("todo");
      setDraftAssignee("");
    }
    setDetailsOpen(true);
  }

  async function createTask() {
    const sb = getSupabase();
    if (!sb) return;
    const title = draftTitle.trim();
    if (!title) {
      Alert.alert("Missing title", "Add a title to create an item.");
      return;
    }
    const due_time = draftTime.trim().match(/^\d{2}:\d{2}$/) ? draftTime.trim() : "09:00";
    const assigned_to = draftAssignee.trim() || "self";
    const { error } = await sb.from("tasks").insert({
      user_id: user?.id,
      title,
      description: null,
      due_date: today,
      due_time,
      type: draftType,
      assigned_to,
      status: "pending",
      completed_at: null,
      source: "manual",
    });
    if (error) {
      Alert.alert("Could not create", error.message);
      return;
    }
    setCreateOpen(false);
    await refreshData();
  }

  async function saveEdits() {
    if (!selected) return;
    if (selected.kind !== "task") {
      setDetailsOpen(false);
      return;
    }
    const sb = getSupabase();
    if (!sb) return;
    const title = draftTitle.trim();
    if (!title) {
      Alert.alert("Missing title", "Title can’t be empty.");
      return;
    }
    const due_time = draftTime.trim().match(/^\d{2}:\d{2}$/) ? draftTime.trim() : null;
    const assigned_to = draftAssignee.trim() || "self";
    const { error } = await sb
      .from("tasks")
      .update({
        title,
        due_time,
        type: draftType,
        assigned_to,
      })
      .eq("id", selected.id);
    if (error) {
      Alert.alert("Could not save", error.message);
      return;
    }
    setDetailsOpen(false);
    await refreshData();
  }

  async function markComplete() {
    if (!selected || selected.kind !== "task") return;
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", selected.id);
    if (error) {
      Alert.alert("Could not complete", error.message);
      return;
    }
    setDetailsOpen(false);
    await refreshData();
  }

  const headerRight = (
    <Pressable accessibilityRole="button" accessibilityLabel="Create calendar item" onPress={openCreate} style={styles.iconBtn}>
      <Ionicons name="add-circle" size={20} color={theme.accent} />
    </Pressable>
  );

  const headerMeta = React.useMemo(() => formatAgendaHeader(today), [today]);

  return (
    <>
      <Screen title="Calendar" subtitle="Today" headerRight={headerRight} scroll={false}>
        <FlatList
          data={items}
          keyExtractor={(it) => `${it.kind}:${it.id}`}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.accent} />
          }
          ListHeaderComponent={
            <View style={styles.agendaHeader}>
              <View style={styles.agendaHeaderRow}>
                <Text style={[styles.agendaHeaderText, { color: theme.accent }]}>
                  Today <Text style={{ color: theme.mutedForeground }}>•</Text> {headerMeta.weekday}{" "}
                  <Text style={{ color: theme.mutedForeground }}>•</Text> {headerMeta.dayMonth}
                </Text>
                <View style={styles.agendaHeaderChevron}>
                  <Ionicons name="chevron-down" size={16} color={theme.mutedForeground} />
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <Text style={{ color: theme.mutedForeground, marginTop: 16 }}>
              No items scheduled for today. Tap + to add one.
            </Text>
          }
          contentContainerStyle={{ paddingBottom: 32 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openDetails(item)}
              style={[styles.agendaRow, { borderColor: theme.border, backgroundColor: theme.card }]}
            >
              <View style={styles.timeCol}>
                <Text style={[styles.timeText, { color: theme.foreground }]}>
                  {item.kind === "task" ? fmtTime(item.due_time) : fmtTime(item.time)}
                </Text>
                <Text style={[styles.durationText, { color: theme.mutedForeground }]}>
                  {item.kind === "task" ? (item.type ?? "task") : "event"}
                </Text>
              </View>

              <View style={[styles.accentBar, { backgroundColor: theme.accent }]} />

              <View style={styles.contentCol}>
                <Text style={[styles.agendaTitle, { color: theme.foreground }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.agendaMeta, { color: theme.mutedForeground }]} numberOfLines={1}>
                  {item.kind === "task"
                    ? `${item.assigned_to ? `@${item.assigned_to}` : "assigned"} · ${item.status}`
                    : `${item.provider ?? "calendar"} · today`}
                </Text>
              </View>

              <View style={styles.trailingIcon}>
                {item.kind === "task" ? (
                  <Ionicons name="checkmark-circle-outline" size={18} color={theme.mutedForeground} />
                ) : (
                  <Ionicons name="chevron-forward" size={16} color={theme.mutedForeground} />
                )}
              </View>
            </Pressable>
          )}
        />
      </Screen>

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCreateOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.foreground }]}>Create</Text>
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="Title"
              placeholderTextColor={theme.mutedForeground}
              style={[styles.input, { color: theme.foreground, borderColor: theme.border }]}
            />
            <TextInput
              value={draftTime}
              onChangeText={setDraftTime}
              placeholder="HH:MM"
              placeholderTextColor={theme.mutedForeground}
              style={[styles.input, { color: theme.foreground, borderColor: theme.border }]}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.pillsRow}>
              {(["todo", "followup", "reminder"] as const).map((t) => {
                const active = draftType === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setDraftType(t)}
                    style={[
                      styles.pill,
                      { borderColor: theme.border, backgroundColor: active ? theme.muted : "transparent" },
                    ]}
                  >
                    <Text style={{ color: active ? theme.foreground : theme.mutedForeground, fontWeight: "700", fontSize: 12 }}>
                      {t}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={draftAssignee}
              onChangeText={setDraftAssignee}
              placeholder="Assignee (optional)"
              placeholderTextColor={theme.mutedForeground}
              style={[styles.input, { color: theme.foreground, borderColor: theme.border }]}
            />

            <View style={styles.modalActions}>
              <Pressable onPress={() => setCreateOpen(false)}>
                <Text style={{ color: theme.mutedForeground }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void createTask()}>
                <Text style={{ color: theme.accent, fontWeight: "800" }}>Create</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={detailsOpen} transparent animationType="fade" onRequestClose={() => setDetailsOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDetailsOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.foreground }]}>Details</Text>
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="Title"
              placeholderTextColor={theme.mutedForeground}
              style={[styles.input, { color: theme.foreground, borderColor: theme.border }]}
            />
            <TextInput
              value={draftTime}
              onChangeText={setDraftTime}
              placeholder="HH:MM"
              placeholderTextColor={theme.mutedForeground}
              style={[styles.input, { color: theme.foreground, borderColor: theme.border }]}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {selected?.kind === "task" ? (
              <>
                <View style={styles.pillsRow}>
                  {(["todo", "followup", "reminder"] as const).map((t) => {
                    const active = draftType === t;
                    return (
                      <Pressable
                        key={t}
                        onPress={() => setDraftType(t)}
                        style={[
                          styles.pill,
                          { borderColor: theme.border, backgroundColor: active ? theme.muted : "transparent" },
                        ]}
                      >
                        <Text
                          style={{
                            color: active ? theme.foreground : theme.mutedForeground,
                            fontWeight: "700",
                            fontSize: 12,
                          }}
                        >
                          {t}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput
                  value={draftAssignee}
                  onChangeText={setDraftAssignee}
                  placeholder="Assignee"
                  placeholderTextColor={theme.mutedForeground}
                  style={[styles.input, { color: theme.foreground, borderColor: theme.border }]}
                />
              </>
            ) : (
              <Text style={{ color: theme.mutedForeground, marginTop: 6 }}>
                This item is a calendar row (not task-linked). Edits are not supported in the mobile MVP.
              </Text>
            )}

            <View style={styles.modalActions}>
              {selected?.kind === "task" ? (
                <Pressable onPress={() => void markComplete()}>
                  <Text style={{ color: theme.foreground, fontWeight: "800" }}>Mark complete</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable onPress={() => void saveEdits()}>
                <Text style={{ color: theme.accent, fontWeight: "800" }}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: { padding: 8 },
  agendaHeader: { paddingTop: 6, paddingBottom: 12 },
  agendaHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  agendaHeaderText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },
  agendaHeaderChevron: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },

  agendaRow: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  timeCol: { width: 64, alignItems: "flex-start" },
  timeText: { fontSize: 13, fontWeight: "800" },
  durationText: { marginTop: 4, fontSize: 11, fontWeight: "700" },
  accentBar: { width: 4, alignSelf: "stretch", borderRadius: 999 },
  contentCol: { flex: 1, minWidth: 0 },
  agendaTitle: { fontSize: 14, fontWeight: "800" },
  agendaMeta: { marginTop: 4, fontSize: 12 },
  trailingIcon: { width: 22, alignItems: "flex-end" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
  modalTitle: { fontSize: 17, fontWeight: "800", marginBottom: 10, textAlign: "center" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, fontSize: 15 },
  pillsRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  pill: { borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  modalActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
});
