import type { User } from "@supabase/supabase-js";

import { getSupabase } from "@/lib/supabase";
import { normalizeUserSettingsRow } from "@/lib/normalizeUserSettingsMobile";
import type { ConnectedAccountRow, SettingsPayload, TeamMemberSummary } from "@/lib/settingsTypes";
import { DEPARTMENT_LABEL, isWorkspaceDepartmentId } from "@/lib/workspaceDepartments";

/**
 * Builds the same `SettingsPayload` shape as GET `/api/mobile/user/settings`, using the
 * signed-in Supabase client (RLS). Used when the Next API is missing (404) or unreachable.
 */
export async function loadSettingsPayloadFromSupabase(user: User): Promise<SettingsPayload | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const userId = user.id;

  const { data: existingRow } = await sb.from("user_settings").select("user_id").eq("user_id", userId).maybeSingle();
  if (!existingRow) {
    await sb.from("user_settings").upsert({ user_id: userId }, { onConflict: "user_id" });
  }

  const { data: profile, error: pErr } = await sb
    .from("profiles")
    .select(
      "id,name,role,created_at,phone,phone_country_code,timezone,location,avatar_url,first_name,middle_name,last_name,display_name",
    )
    .eq("id", userId)
    .maybeSingle();
  if (pErr) {
    console.warn("[loadSettingsPayloadFromSupabase] profiles", pErr.message);
  }

  const { data: settingsRaw, error: sErr } = await sb.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
  if (sErr || !settingsRaw) {
    console.warn("[loadSettingsPayloadFromSupabase] user_settings", sErr?.message ?? "no row");
    return null;
  }

  const settings = normalizeUserSettingsRow(userId, settingsRaw as Record<string, unknown>);

  const connectedRes = await sb
    .from("user_connected_accounts")
    .select("id,user_id,provider,account_email,display_name,created_at,provider_subject,scopes")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (connectedRes.error) {
    console.warn("[loadSettingsPayloadFromSupabase] user_connected_accounts", connectedRes.error.message);
  }
  const connectedAccounts = (connectedRes.data ?? []) as ConnectedAccountRow[];

  const teamRes = await sb
    .from("team_members")
    .select("id,member_user_id,display_name,status")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true });
  if (teamRes.error) {
    console.warn("[loadSettingsPayloadFromSupabase] team_members", teamRes.error.message);
  }
  const teamRows = teamRes.data ?? [];

  const ids = teamRows.map((r) => r.id);
  let perms: Array<{ team_member_id: string; can_view_dashboard_for_others: boolean }> = [];
  if (ids.length > 0) {
    const permRes = await sb
      .from("team_member_permissions")
      .select("team_member_id,can_view_dashboard_for_others")
      .in("team_member_id", ids);
    if (permRes.error) {
      console.warn("[loadSettingsPayloadFromSupabase] team_member_permissions", permRes.error.message);
    } else {
      perms = permRes.data ?? [];
    }
  }

  const permMap = new Map(perms.map((p) => [p.team_member_id, p.can_view_dashboard_for_others]));

  const deptLabelByMemberUserId = new Map<string, string>();
  if (teamRows.length > 0) {
    const assignRes = await sb
      .from("workspace_department_assignments")
      .select("user_id, department")
      .eq("workspace_owner_id", userId);
    if (!assignRes.error && assignRes.data) {
      for (const row of assignRes.data) {
        const uid = String((row as { user_id: string }).user_id);
        const d = String((row as { department: string }).department);
        if (isWorkspaceDepartmentId(d)) deptLabelByMemberUserId.set(uid, DEPARTMENT_LABEL[d]);
      }
    }
  }

  const teamMembers: TeamMemberSummary[] = teamRows.map((r) => ({
    id: r.id,
    member_user_id: r.member_user_id,
    display_name: r.display_name,
    status: r.status,
    can_view_dashboard_for_others: Boolean(permMap.get(r.id)),
    department: deptLabelByMemberUserId.get(String(r.member_user_id)) ?? null,
  }));

  return {
    email: user.email ?? null,
    profile: {
      id: profile?.id ?? userId,
      name: profile?.name ?? null,
      created_at: profile?.created_at ?? null,
      first_name: profile?.first_name ?? null,
      middle_name: profile?.middle_name ?? null,
      last_name: profile?.last_name ?? null,
      display_name: profile?.display_name ?? null,
      role: String(profile?.role ?? "member"),
      phone: profile?.phone ?? null,
      phone_country_code: profile?.phone_country_code ?? null,
      timezone: profile?.timezone ?? null,
      location: profile?.location ?? null,
      avatar_url: profile?.avatar_url ?? null,
    },
    settings,
    connectedAccounts,
    teamMembers,
  };
}
