import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProfileRole } from "@/store/userStore";

export type WorkspaceContext = {
  workspaceOwnerId: string;
  viewerUserId: string;
  viewerRole: ProfileRole;
  isFounder: boolean;
  isEa: boolean;
};

function coerceRole(raw: string | null | undefined): ProfileRole {
  if (raw === "founder" || raw === "ea" || raw === "manager" || raw === "associate" || raw === "member") {
    return raw;
  }
  return "member";
}

/**
 * Resolves the founder workspace id for the current user.
 * Founders own their workspace; team members inherit the owner's workspace from `team_members`.
 */
export async function resolveWorkspaceContext(
  supabase: SupabaseClient,
  viewerUserId: string,
): Promise<WorkspaceContext> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", viewerUserId)
    .maybeSingle();

  const viewerRole = coerceRole(profile?.role as string | undefined);

  if (viewerRole === "founder") {
    return {
      workspaceOwnerId: viewerUserId,
      viewerUserId,
      viewerRole,
      isFounder: true,
      isEa: false,
    };
  }

  const { data: membership } = await supabase
    .from("team_members")
    .select("owner_user_id")
    .eq("member_user_id", viewerUserId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const workspaceOwnerId = membership?.owner_user_id ?? viewerUserId;

  return {
    workspaceOwnerId,
    viewerUserId,
    viewerRole,
    isFounder: false,
    isEa: viewerRole === "ea",
  };
}
