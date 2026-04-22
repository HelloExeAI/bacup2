import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Screen } from "@/components/Screen";
import { useAuth } from "@/context/AuthContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useAppTheme } from "@/context/ThemeContext";
import { getAppApiOrigin } from "@/lib/apiOrigin";
import {
  datePlaceholder,
  formatDate,
  formatTime,
  formatTimestamp,
  parseDate,
  parseTime,
  timePlaceholder,
} from "@/lib/dateTimePrefs";
import { getSupabase } from "@/lib/supabase";

function normalizeType(v: string): "todo" | "followup" | "reminder" {
  return v === "followup" || v === "reminder" ? v : "todo";
}

export default function TaskDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tasks, refreshData, session, user } = useAuth();
  const { theme } = useAppTheme();
  const { dateFormat, timeFormat } = usePreferences();

  const task = React.useMemo(() => tasks.find((t) => t.id === id), [tasks, id]);
  const [saving, setSaving] = React.useState(false);
  const [redrafting, setRedrafting] = React.useState(false);
  const [commentsLoading, setCommentsLoading] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [dueTime, setDueTime] = React.useState("");
  const [assignedTo, setAssignedTo] = React.useState("");
  const [type, setType] = React.useState<"todo" | "followup" | "reminder">("todo");

  const [comments, setComments] = React.useState<
    Array<{ id: string; body: string; created_at: string; user_id: string; author_kind?: string; author_name?: string }>
  >(
    [],
  );
  const [newComment, setNewComment] = React.useState("");

  React.useEffect(() => {
    if (!task) return;
    setTitle(task.title ?? "");
    setDescription(String((task as any).description ?? ""));
    setDueDate(formatDate(task.due_date ?? "", dateFormat));
    setDueTime(formatTime(String(task.due_time ?? "").slice(0, 5), timeFormat));
    setAssignedTo(String((task as any).assigned_to ?? ""));
    setType(normalizeType(String(task.type ?? "todo")));
  }, [task, dateFormat, timeFormat]);

  const loadComments = React.useCallback(async () => {
    if (!task) return;
    const sb = getSupabase();
    if (!sb) return;
    setCommentsLoading(true);
    try {
      const { data, error } = await sb
        .from("task_comments")
        .select("id,body,created_at,user_id,author_kind,author_name")
        .eq("task_id", task.id)
        .order("created_at", { ascending: true });
      if (error) return;
      setComments((data ?? []) as any);
    } finally {
      setCommentsLoading(false);
    }
  }, [task]);

  React.useEffect(() => {
    void loadComments();
  }, [loadComments]);

  async function addComment() {
    if (!task) return;
    const sb = getSupabase();
    if (!sb) return;
    const userId = user?.id;
    if (!userId) {
      Alert.alert("Not signed in", "Sign in to add comments.");
      return;
    }
    const body = newComment.trim();
    if (!body) return;
    setNewComment("");
    const { error } = await sb.from("task_comments").insert({ task_id: task.id, user_id: userId, body });
    if (error) {
      Alert.alert("Could not comment", error.message);
      setNewComment(body);
      return;
    }
    await loadComments();
  }

  const headerRight = (
    <View style={styles.headerActions}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Redraft with AI"
        disabled={saving || redrafting}
        onPress={() => void redraft()}
        style={({ pressed }) => [{ padding: 6, opacity: saving || redrafting ? 0.4 : pressed ? 0.7 : 1 }]}
      >
        <Ionicons name="sparkles" size={20} color={theme.accent} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save"
        disabled={saving || redrafting}
        onPress={() => void save()}
        style={({ pressed }) => [{ padding: 6, opacity: saving || redrafting ? 0.4 : pressed ? 0.7 : 1 }]}
      >
        <Ionicons name="save-outline" size={20} color={theme.foreground} />
      </Pressable>
      {task?.status === "pending" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark complete"
          disabled={saving || redrafting}
          onPress={() => void markComplete()}
          style={({ pressed }) => [{ padding: 6, opacity: saving || redrafting ? 0.4 : pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="checkmark-circle-outline" size={22} color="#16a34a" />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete"
        disabled={saving || redrafting}
        onPress={() => remove()}
        style={({ pressed }) => [{ padding: 6, opacity: saving || redrafting ? 0.4 : pressed ? 0.7 : 1 }]}
      >
        <Ionicons name="trash-outline" size={20} color="#dc2626" />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={() => router.back()}
        style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.7 : 1 }]}
      >
        <Ionicons name="close" size={22} color={theme.foreground} />
      </Pressable>
    </View>
  );

  async function save() {
    const sb = getSupabase();
    if (!sb) return;
    if (!task) return;

    const nextTitle = title.trim();
    if (!nextTitle) {
      Alert.alert("Missing title", "Title can’t be empty.");
      return;
    }
    const nextDesc = description.trim();
    const isoDueDate = parseDate(dueDate, dateFormat);
    if (!isoDueDate) {
      Alert.alert("Invalid date", `Enter a valid date (${datePlaceholder(dateFormat)}).`);
      return;
    }

    const due_time =
      dueTime.trim().length === 0 ? null : parseTime(dueTime, timeFormat);
    if (dueTime.trim().length > 0 && !due_time) {
      Alert.alert("Invalid time", `Enter a valid time (${timePlaceholder(timeFormat)}).`);
      return;
    }
    const assigned_to = assignedTo.trim() || "self";

    setSaving(true);
    try {
      const { error } = await sb
        .from("tasks")
        .update({
          title: nextTitle,
          description: nextDesc.length ? nextDesc : null,
          due_date: isoDueDate,
          due_time,
          assigned_to,
          type,
        })
        .eq("id", task.id);
      if (error) {
        Alert.alert("Could not save", error.message);
        return;
      }
      await refreshData();
      router.back();
    } finally {
      setSaving(false);
    }
  }

  async function redraft() {
    const origin = getAppApiOrigin();
    if (!origin) {
      Alert.alert("API URL missing", "Set EXPO_PUBLIC_APP_URL in apps/mobile/.env to enable AI redrafting.");
      return;
    }
    const token = session?.access_token;
    if (!token) {
      Alert.alert("Not signed in", "Sign in to use AI redrafting.");
      return;
    }
    const nextTitle = title.trim();
    if (!nextTitle) {
      Alert.alert("Missing title", "Add a title first.");
      return;
    }

    setRedrafting(true);
    try {
      const res = await fetch(`${origin}/api/mobile/tasks/redraft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: nextTitle,
          description: description.trim() || null,
          due_date: parseDate(dueDate, dateFormat) || undefined,
          due_time: parseTime(dueTime, timeFormat) || undefined,
          assigned_to: assignedTo.trim() || undefined,
          type,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { error?: string; title?: string; description?: string; assigned_to?: string }
        | null;
      if (!res.ok) {
        Alert.alert("AI redraft failed", json?.error || `Request failed (${res.status})`);
        return;
      }
      const t = String(json?.title ?? "").trim();
      const d = String(json?.description ?? "").trim();
      const a = String(json?.assigned_to ?? "").trim();
      if (t) setTitle(t);
      if (d) setDescription(d);
      if (a) setAssignedTo(a);
    } catch (e) {
      Alert.alert("AI redraft failed", e instanceof Error ? e.message : "Network error");
    } finally {
      setRedrafting(false);
    }
  }

  async function markComplete() {
    const sb = getSupabase();
    if (!sb) return;
    if (!task) return;

    setSaving(true);
    try {
      const { error } = await sb
        .from("tasks")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("id", task.id);
      if (error) {
        Alert.alert("Could not complete", error.message);
        return;
      }
      await refreshData();
      router.back();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const sb = getSupabase();
    if (!sb) return;
    if (!task) return;

    Alert.alert("Delete task?", "This can’t be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              const { error } = await sb.from("tasks").delete().eq("id", task.id);
              if (error) {
                Alert.alert("Could not delete", error.message);
                return;
              }
              await refreshData();
              router.back();
            } finally {
              setSaving(false);
            }
          })();
        },
      },
    ]);
  }

  if (!task) {
    return (
      <Screen title="Task" subtitle="Not found" headerRight={headerRight} scroll={false}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.foreground }]}>This task isn’t available.</Text>
          <Text style={[styles.meta, { color: theme.mutedForeground }]}>It may have been deleted or not synced yet.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="Task"
      subtitle={task.status === "pending" ? "Open" : "Completed"}
      headerRight={headerRight}
      scroll
    >
      <View style={styles.wrap}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.label, { color: theme.mutedForeground }]}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What needs to be done?"
            placeholderTextColor={theme.mutedForeground}
            style={[styles.input, { color: theme.foreground, borderColor: theme.border }]}
          />

          <Text style={[styles.label, { color: theme.mutedForeground }]}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Add steps / acceptance criteria…"
            placeholderTextColor={theme.mutedForeground}
            multiline
            style={[styles.textarea, { color: theme.foreground, borderColor: theme.border }]}
          />

          <View style={styles.grid}>
            <View style={styles.col}>
              <Text style={[styles.label, { color: theme.mutedForeground }]}>Due date</Text>
              <TextInput
                value={dueDate}
                onChangeText={setDueDate}
                placeholder={datePlaceholder(dateFormat)}
                placeholderTextColor={theme.mutedForeground}
                autoCapitalize="none"
                style={[styles.input, { color: theme.foreground, borderColor: theme.border }]}
              />
            </View>
            <View style={styles.col}>
              <Text style={[styles.label, { color: theme.mutedForeground }]}>Time</Text>
              <TextInput
                value={dueTime}
                onChangeText={setDueTime}
                placeholder={timePlaceholder(timeFormat)}
                placeholderTextColor={theme.mutedForeground}
                autoCapitalize="none"
                style={[styles.input, { color: theme.foreground, borderColor: theme.border }]}
              />
            </View>
          </View>

          <Text style={[styles.label, { color: theme.mutedForeground }]}>Assignee</Text>
          <TextInput
            value={assignedTo}
            onChangeText={setAssignedTo}
            placeholder="self"
            placeholderTextColor={theme.mutedForeground}
            autoCapitalize="words"
            style={[styles.input, { color: theme.foreground, borderColor: theme.border }]}
          />

          <Text style={[styles.label, { color: theme.mutedForeground }]}>Type</Text>
          <View style={styles.pillsRow}>
            {(["todo", "followup", "reminder"] as const).map((k) => (
              <Pressable
                key={k}
                accessibilityRole="button"
                onPress={() => setType(k)}
                style={({ pressed }) => [
                  styles.pill,
                  {
                    borderColor: theme.border,
                    backgroundColor: type === k ? theme.muted : theme.card,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={[styles.pillText, { color: theme.foreground }]}>{k}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 12 }]}>
          <Text style={[styles.sectionTitle, { color: theme.foreground }]}>Comments</Text>
          {comments.length === 0 ? (
            <Text style={[styles.meta, { color: theme.mutedForeground, marginTop: 6 }]}>
              {commentsLoading ? "Loading…" : "No comments yet."}
            </Text>
          ) : (
            <View style={{ paddingTop: 8 }}>
              {comments.map((item) => (
                <View style={[styles.commentRow, { borderColor: theme.border }]}>
                  <Text style={[styles.commentBody, { color: theme.foreground }]}>{item.body}</Text>
                  <Text style={[styles.commentMeta, { color: theme.mutedForeground }]}>
                    {String((item as any).author_name || (item as any).author_kind || "user")} ·{" "}
                    {formatTimestamp(item.created_at, dateFormat, timeFormat)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.commentComposer}>
            <TextInput
              value={newComment}
              onChangeText={setNewComment}
              placeholder="Add a comment…"
              placeholderTextColor={theme.mutedForeground}
              multiline
              style={[styles.commentInput, { color: theme.foreground, borderColor: theme.border }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send comment"
              onPress={() => void addComment()}
              disabled={!newComment.trim()}
              style={({ pressed }) => [
                styles.sendBtn,
                { opacity: !newComment.trim() ? 0.4 : pressed ? 0.75 : 1, backgroundColor: theme.muted },
              ]}
            >
              <Ionicons name="send" size={18} color={theme.foreground} />
            </Pressable>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingBottom: 24 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 2 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1 },
  sectionTitle: { fontSize: 14, fontWeight: "800" },
  title: { fontSize: 14, fontWeight: "700" },
  meta: { marginTop: 6, fontSize: 12, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: "700", marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  textarea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    minHeight: 96,
    textAlignVertical: "top",
  },
  grid: { flexDirection: "row", gap: 10 },
  col: { flex: 1, minWidth: 0 },
  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  pill: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: "700" },
  commentRow: { paddingVertical: 10, borderTopWidth: 1 },
  commentBody: { fontSize: 13, lineHeight: 18 },
  commentMeta: { marginTop: 6, fontSize: 11 },
  commentComposer: { flexDirection: "row", gap: 10, alignItems: "flex-end", marginTop: 10 },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 13,
    minHeight: 44,
    textAlignVertical: "top",
  },
  sendBtn: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12 },
});

