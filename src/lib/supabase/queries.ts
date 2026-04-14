import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/store/userStore";
import type { Task } from "@/store/taskStore";
import type { Event } from "@/store/eventStore";
import type { Block } from "@/store/scratchpadStore";

export type DashboardViewOption = {
  user_id: string;
  label: string;
  kind: "self" | "team";
  department?: string | null;
  department_label?: string | null;
};

export type DashboardAccess = {
  canViewOthers: boolean;
  options: DashboardViewOption[];
};

export async function fetchMyProfile(
  supabase: SupabaseClient,
): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id,name,role,created_at,phone,phone_country_code,timezone,location,avatar_url,first_name,middle_name,last_name,display_name",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data as Profile | null;
}

export async function fetchMyTasks(supabase: SupabaseClient): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function fetchMyEvents(supabase: SupabaseClient): Promise<Event[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("date", { ascending: true })
    .order("time", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as Event[];
}

export async function fetchBlocksForDate(
  supabase: SupabaseClient,
  ymd: string,
): Promise<Block[]> {
  const { data, error } = await supabase
    .from("blocks")
    .select("id,user_id,content,parent_id,date,order_index,created_at")
    .eq("date", ymd)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Block[];
}

export async function upsertBlocks(
  supabase: SupabaseClient,
  blocks: Array<
    Pick<Block, "id" | "user_id" | "content" | "parent_id" | "date" | "order_index">
  >,
): Promise<Block[]> {
  if (blocks.length === 0) return [];

  const { data, error } = await supabase
    .from("blocks")
    .upsert(blocks, { onConflict: "id" })
    .select("id,user_id,content,parent_id,date,order_index,created_at");

  if (error) throw error;
  return (data ?? []) as Block[];
}

export async function fetchDashboardViewOptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<DashboardAccess> {
  const self: DashboardViewOption = { user_id: userId, label: "Self", kind: "self" };

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) {
    return { canViewOthers: false, options: [self] };
  }

  const role = String(profile?.role ?? "member");
  let canViewOthers = role === "founder" || role === "ea";

  if (!canViewOthers) {
    const { data: permRows, error: permErr } = await supabase
      .from("team_member_permissions")
      .select("team_member_id")
      .eq("can_view_dashboard_for_others", true)
      .limit(50);
    if (!permErr && permRows && permRows.length > 0) {
      const ids = permRows.map((p) => p.team_member_id).filter(Boolean) as string[];
      if (ids.length > 0) {
        const { data: memberships, error: memErr } = await supabase
          .from("team_members")
          .select("id")
          .eq("member_user_id", userId)
          .in("id", ids);
        if (!memErr && memberships && memberships.length > 0) {
          canViewOthers = true;
        }
      }
    }
  }

  const options: DashboardViewOption[] = [self];
  if (!canViewOthers) {
    return { canViewOthers, options };
  }

  const { data: ownedMembers, error: ownedErr } = await supabase
    .from("team_members")
    .select("member_user_id, display_name, status")
    .eq("owner_user_id", userId)
    .eq("status", "active");

  if (ownedErr) {
    return { canViewOthers: true, options: [self] };
  }

  for (const row of ownedMembers ?? []) {
    const memberId = String(row.member_user_id ?? "");
    if (!memberId || memberId === userId) continue;
    options.push({
      user_id: memberId,
      label: String(row.display_name ?? "Team member"),
      kind: "team",
    });
  }

  const unique = new Map<string, DashboardViewOption>();
  for (const o of options) {
    if (!unique.has(o.user_id)) unique.set(o.user_id, o);
  }
  return { canViewOthers, options: Array.from(unique.values()) };
}

export async function fetchDashboardTasksByView(
  supabase: SupabaseClient,
  currentUserId: string,
  viewUserId: string,
): Promise<Task[]> {
  if (currentUserId !== viewUserId) {
    return [];
  }
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", viewUserId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Task[];
}

