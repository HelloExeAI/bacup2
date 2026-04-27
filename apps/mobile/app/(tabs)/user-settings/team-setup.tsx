import * as React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SaveTick } from "@/components/settings/SaveTick";
import { useAuth } from "@/context/AuthContext";
import { useSaveFeedback } from "@/context/SaveFeedbackContext";
import { useAppTheme } from "@/context/ThemeContext";
import {
  fetchMobileTeamSetup,
  patchMobileTeamSetup,
  type TeamSetupPayload,
  type TeamSetupPerson,
} from "@/lib/mobileSettingsApi";
import {
  DEPARTMENT_LABEL,
  MANAGEMENT_DEPARTMENTS,
  REVENUE_DEPARTMENTS,
  SUPPORT_DEPARTMENTS,
  type WorkspaceDepartmentId,
  isWorkspaceDepartmentId,
} from "@/lib/workspaceDepartments";
import { getAppApiOrigin } from "@/lib/apiOrigin";

export default function TeamSetupSettingsScreen() {
  const { theme } = useAppTheme();
  const { notifySaved } = useSaveFeedback();
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const api = Boolean(getAppApiOrigin());

  const [payload, setPayload] = React.useState<TeamSetupPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [deptByUser, setDeptByUser] = React.useState<Record<string, WorkspaceDepartmentId>>({});
  const [setupPermByUser, setSetupPermByUser] = React.useState<Record<string, boolean>>({});
  const [pickerFor, setPickerFor] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!api || !token) {
      setPayload(null);
      setLoading(false);
      setErr(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const j = await fetchMobileTeamSetup(token);
      setPayload(j);
      const d: Record<string, WorkspaceDepartmentId> = {};
      const p: Record<string, boolean> = {};
      for (const row of j.people ?? []) {
        if (row.department && isWorkspaceDepartmentId(row.department)) d[row.user_id] = row.department;
        if (row.team_member_id) p[row.user_id] = Boolean(row.can_manage_business_setup);
      }
      setDeptByUser(d);
      setSetupPermByUser(p);
    } catch (e) {
      setPayload(null);
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [api, token]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const hasChanges = React.useMemo(() => {
    if (!payload?.people?.length) return false;
    for (const row of payload.people) {
      const curDept = row.department && isWorkspaceDepartmentId(row.department) ? row.department : null;
      const nextDept = deptByUser[row.user_id] ?? null;
      if (curDept !== nextDept) return true;
      if (payload.is_founder_viewer && row.team_member_id && row.user_id !== payload.workspace_owner_id) {
        const curPerm = Boolean(row.can_manage_business_setup);
        const nextPerm = Boolean(setupPermByUser[row.user_id]);
        if (curPerm !== nextPerm) return true;
      }
    }
    return false;
  }, [payload, deptByUser, setupPermByUser]);

  async function save() {
    if (!api || !token || !payload?.can_edit || !payload.people.length) return;
    setSaving(true);
    setErr(null);
    try {
      const assignments = payload.people.map((row) => {
        const d = deptByUser[row.user_id];
        if (!d) throw new Error(`Choose a department for ${row.label}`);
        return { user_id: row.user_id, department: d };
      });
      const body: {
        assignments: typeof assignments;
        setup_permissions?: { member_user_id: string; can_manage_business_setup: boolean }[];
      } = { assignments };

      if (payload.is_founder_viewer) {
        body.setup_permissions = payload.people
          .filter((row) => row.team_member_id && row.user_id !== payload.workspace_owner_id)
          .map((row) => ({
            member_user_id: row.user_id,
            can_manage_business_setup: Boolean(setupPermByUser[row.user_id]),
          }));
      }

      await patchMobileTeamSetup(token, body);
      notifySaved();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!api || !token) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.mutedForeground, textAlign: "center", paddingHorizontal: 24 }}>
          Sign in and set EXPO_PUBLIC_APP_URL to manage team setup from mobile.
        </Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </SafeAreaView>
    );
  }

  if (err && !payload) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: "#b91c1c", textAlign: "center", paddingHorizontal: 20 }}>{err}</Text>
        <Pressable onPress={() => void load()} style={{ marginTop: 16 }}>
          <Text style={{ color: theme.accent, fontWeight: "700" }}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!payload) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.mutedForeground }}>Nothing to show.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["bottom", "left", "right"]}>
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.p, { color: theme.mutedForeground }]}>
          Map workspace members to Revenue, Support, or Management departments. The same data appears in web Settings
          → Team setup.
        </Text>

        {!payload.can_edit ? (
          <View style={[styles.note, { borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.1)" }]}>
            <Text style={{ color: theme.foreground, fontSize: 13 }}>
              View only. Only the workspace founder or a member with Team Setup permission can edit.
            </Text>
          </View>
        ) : null}

        {err ? <Text style={{ color: "#b91c1c", marginBottom: 10 }}>{err}</Text> : null}

        {payload.people.map((row) => (
          <PersonCard
            key={row.user_id}
            row={row}
            payload={payload}
            theme={theme}
            dept={deptByUser[row.user_id]}
            pickerFor={pickerFor}
            setPickerFor={setPickerFor}
            canEdit={payload.can_edit}
            setupAdmin={Boolean(setupPermByUser[row.user_id])}
            onToggleSetup={(v) => setSetupPermByUser((prev) => ({ ...prev, [row.user_id]: v }))}
            onPickDept={(d) => {
              setDeptByUser((prev) => ({ ...prev, [row.user_id]: d }));
              setPickerFor(null);
            }}
          />
        ))}

        </ScrollView>

        {payload.can_edit ? (
          <View style={[styles.bottomBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
            <SaveTick
              disabled={saving || !hasChanges}
              onPress={() => void save()}
              theme={theme}
              accessibilityLabel="Save team setup"
            />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function PersonCard({
  row,
  payload,
  theme,
  dept,
  pickerFor,
  setPickerFor,
  canEdit,
  setupAdmin,
  onToggleSetup,
  onPickDept,
}: {
  row: TeamSetupPerson;
  payload: TeamSetupPayload;
  theme: ReturnType<typeof useAppTheme>["theme"];
  dept: WorkspaceDepartmentId | undefined;
  pickerFor: string | null;
  setPickerFor: (id: string | null) => void;
  canEdit: boolean;
  setupAdmin: boolean;
  onToggleSetup: (v: boolean) => void;
  onPickDept: (d: WorkspaceDepartmentId) => void;
}) {
  const open = pickerFor === row.user_id;
  const showDept = row.department && isWorkspaceDepartmentId(row.department) ? DEPARTMENT_LABEL[row.department] : "—";

  return (
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}>
      <Text style={[styles.name, { color: theme.foreground }]}>{row.label}</Text>
      {row.user_id === payload.workspace_owner_id ? (
        <Text style={{ color: theme.mutedForeground, fontSize: 12, marginTop: 2 }}>Workspace owner</Text>
      ) : null}

      {payload.is_founder_viewer && row.team_member_id ? (
        <View style={styles.switchRow}>
          <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>Setup admin</Text>
          <Switch value={setupAdmin} onValueChange={onToggleSetup} disabled={!canEdit} />
        </View>
      ) : null}

      {canEdit ? (
        <>
          <Pressable onPress={() => setPickerFor(open ? null : row.user_id)} style={styles.deptBtn}>
            <Text style={{ color: theme.accent, fontWeight: "700" }}>{dept ? DEPARTMENT_LABEL[dept] : "Select department…"}</Text>
          </Pressable>
          {open ? (
            <View style={{ marginTop: 8 }}>
              <DeptGroup title="Revenue" ids={REVENUE_DEPARTMENTS} onPick={onPickDept} theme={theme} />
              <DeptGroup title="Support" ids={SUPPORT_DEPARTMENTS} onPick={onPickDept} theme={theme} />
              <DeptGroup title="Management" ids={MANAGEMENT_DEPARTMENTS} onPick={onPickDept} theme={theme} />
            </View>
          ) : null}
        </>
      ) : (
        <Text style={{ color: theme.mutedForeground, marginTop: 8 }}>{showDept}</Text>
      )}
    </View>
  );
}

function DeptGroup({
  title,
  ids,
  onPick,
  theme,
}: {
  title: string;
  ids: readonly WorkspaceDepartmentId[];
  onPick: (d: WorkspaceDepartmentId) => void;
  theme: ReturnType<typeof useAppTheme>["theme"];
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: theme.mutedForeground, fontSize: 11, fontWeight: "700", marginBottom: 6 }}>{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {ids.map((id) => (
          <Pressable
            key={id}
            onPress={() => onPick(id)}
            style={[styles.deptChip, { borderColor: theme.border, backgroundColor: theme.muted }]}
          >
            <Text style={{ color: theme.foreground, fontSize: 12, fontWeight: "600" }}>{DEPARTMENT_LABEL[id]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  root: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  scroll: { padding: 14, paddingBottom: 110 },
  p: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  note: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 14 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  name: { fontSize: 14, fontWeight: "800" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  deptBtn: { marginTop: 8, alignSelf: "flex-start" },
  deptChip: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1 },
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
