import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { isWorkspaceDepartmentId, type WorkspaceDepartmentId } from "@/lib/workspace/departments";
import { capturePostHogServerEvent } from "@/lib/posthog-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

/** Supabase/PostgREST errors are plain objects with `message`, not `Error` instances. */
function errorMessageFromUnknown(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const msg = o.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
    const details = o.details;
    if (typeof details === "string" && details.trim()) return details.trim();
    const hint = o.hint;
    if (typeof hint === "string" && hint.trim()) return hint.trim();
  }
  return "Unknown error";
}

const AssignmentSchema = z.object({
  user_id: z.string().uuid(),
  department: z.string(),
});

const SetupPermissionSchema = z.object({
  member_user_id: z.string().uuid(),
  can_manage_business_setup: z.boolean(),
});

const PatchSchema = z
  .object({
    assignments: z.array(AssignmentSchema).min(1),
    setup_permissions: z.array(SetupPermissionSchema).optional(),
  })
  .strict();

function profileDisplayName(p: {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
}): string {
  const d = p.display_name?.trim();
  if (d) return d;
  const fn = p.first_name?.trim() ?? "";
  const ln = p.last_name?.trim() ?? "";
  const parts = [fn, ln].filter(Boolean).join(" ").trim();
  if (parts) return parts;
  return p.name?.trim() || "Member";
}

async function viewerCanManageBusinessSetup(
  db: SupabaseClient,
  viewerId: string,
  workspaceOwnerId: string,
): Promise<boolean> {
  if (viewerId === workspaceOwnerId) return true;
  const { data: tm } = await db
    .from("team_members")
    .select("id")
    .eq("owner_user_id", workspaceOwnerId)
    .eq("member_user_id", viewerId)
    .eq("status", "active")
    .maybeSingle();
  if (!tm?.id) return false;
  const { data: perm } = await db
    .from("team_member_permissions")
    .select("can_manage_business_setup")
    .eq("team_member_id", tm.id)
    .maybeSingle();
  return Boolean(perm?.can_manage_business_setup);
}

async function fetchActiveTeamForOwner(db: SupabaseClient, workspaceOwnerId: string) {
  const { data, error } = await db
    .from("team_members")
    .select("id, member_user_id, display_name, status")
    .eq("owner_user_id", workspaceOwnerId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Display labels without bulk-reading other users' profiles (RLS). Uses `team_members.display_name`
 * and the founder's own `profiles` row when the viewer is the founder.
 */
async function buildRosterDisplayLabels(
  supabase: SupabaseClient,
  rosterUserIds: string[],
  workspaceOwnerId: string,
  teamRows: Awaited<ReturnType<typeof fetchActiveTeamForOwner>>,
  viewerUserId: string,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();

  for (const row of teamRows) {
    const mid = String(row.member_user_id);
    const dn = typeof row.display_name === "string" ? row.display_name.trim() : "";
    if (dn) labels.set(mid, dn);
  }

  if (viewerUserId === workspaceOwnerId) {
    const { data: founderProf } = await supabase
      .from("profiles")
      .select("id, name, first_name, last_name, display_name")
      .eq("id", workspaceOwnerId)
      .maybeSingle();
    if (founderProf) labels.set(workspaceOwnerId, profileDisplayName(founderProf));
  }

  for (const uid of rosterUserIds) {
    if (!labels.has(uid)) {
      labels.set(uid, uid === workspaceOwnerId ? "Workspace owner" : "Member");
    }
  }

  return labels;
}

export async function GET() {
  let viewerId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    viewerId = user.id;

    const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
    if (denied) return denied;

    const ctx = await resolveWorkspaceContext(supabase, user.id);
    const ws = ctx.workspaceOwnerId;

    // Session client only: a wrong/missing service-role secret must not turn this into an anonymous
    // PostgREST client (auth.uid() null → "permission denied for schema public").
    const teamRows = await fetchActiveTeamForOwner(supabase, ws);
    const rosterIds = new Set<string>([ws, ...teamRows.map((r) => String(r.member_user_id))]);

    const { data: assignRows, error: aErr } = await supabase
      .from("workspace_department_assignments")
      .select("user_id, department")
      .eq("workspace_owner_id", ws);
    if (aErr) throw aErr;

    const deptByUser = new Map<string, WorkspaceDepartmentId>();
    for (const r of assignRows ?? []) {
      const uid = String((r as { user_id: string }).user_id);
      const d = String((r as { department: string }).department);
      if (isWorkspaceDepartmentId(d)) deptByUser.set(uid, d);
    }

    const ids = Array.from(rosterIds);
    const labelByUserId = await buildRosterDisplayLabels(supabase, ids, ws, teamRows, user.id);

    const permByMemberId = new Map<string, boolean>();
    const teamIds = teamRows.map((r) => r.id).filter(Boolean);
    if (teamIds.length > 0) {
      const { data: perms } = await supabase
        .from("team_member_permissions")
        .select("team_member_id, can_manage_business_setup")
        .in("team_member_id", teamIds);
      for (const p of perms ?? []) {
        permByMemberId.set(
          String((p as { team_member_id: string }).team_member_id),
          Boolean((p as { can_manage_business_setup?: boolean }).can_manage_business_setup),
        );
      }
    }

    const canEdit = await viewerCanManageBusinessSetup(supabase, user.id, ws);
    const isFounderViewer = ctx.isFounder;

    const people = ids.map((uid) => {
      const label = labelByUserId.get(uid) ?? "Member";
      if (uid === ws) {
        return {
          user_id: uid,
          label,
          team_member_id: null as string | null,
          can_manage_business_setup: true,
          department: deptByUser.get(uid) ?? null,
        };
      }
      const tm = teamRows.find((t) => String(t.member_user_id) === uid);
      const tmId = tm?.id ? String(tm.id) : null;
      return {
        user_id: uid,
        label,
        team_member_id: tmId,
        can_manage_business_setup: tmId ? Boolean(permByMemberId.get(tmId)) : false,
        department: deptByUser.get(uid) ?? null,
      };
    });

    people.sort((a, b) => {
      if (a.user_id === ws) return -1;
      if (b.user_id === ws) return 1;
      return a.label.localeCompare(b.label);
    });

    return NextResponse.json({
      workspace_owner_id: ws,
      can_edit: canEdit,
      is_founder_viewer: isFounderViewer,
      people,
    });
  } catch (e) {
    const msg = errorMessageFromUnknown(e);
    console.error("[business-setup GET]", e);
    if (viewerId) {
      void capturePostHogServerEvent(viewerId, "business_setup_api_error", {
        method: "GET",
        http_status: 500,
        error_message: msg,
        route: "/api/workspace/business-setup",
      });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  let viewerId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    viewerId = user.id;

    const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
    if (denied) return denied;

    const ctx = await resolveWorkspaceContext(supabase, user.id);
    const ws = ctx.workspaceOwnerId;

    const canEdit = await viewerCanManageBusinessSetup(supabase, user.id, ws);
    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const json = await req.json().catch(() => null);
    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
    }

    const teamRows = await fetchActiveTeamForOwner(supabase, ws);
    const roster = new Set<string>([ws, ...teamRows.map((r) => String(r.member_user_id))]);

    const incomingIds = new Set(parsed.data.assignments.map((a) => a.user_id));
    if (incomingIds.size !== roster.size || ![...roster].every((id) => incomingIds.has(id))) {
      return NextResponse.json(
        { error: "assignments must include exactly one entry per workspace member" },
        { status: 400 },
      );
    }

    const rows: Array<{ workspace_owner_id: string; user_id: string; department: string }> = [];
    for (const a of parsed.data.assignments) {
      if (!isWorkspaceDepartmentId(a.department)) {
        return NextResponse.json({ error: `Invalid department: ${a.department}` }, { status: 400 });
      }
      rows.push({ workspace_owner_id: ws, user_id: a.user_id, department: a.department });
    }

    if (parsed.data.setup_permissions !== undefined && !ctx.isFounder) {
      return NextResponse.json({ error: "Only the workspace owner can update setup permissions" }, { status: 403 });
    }

    if (ctx.isFounder && parsed.data.setup_permissions?.length) {
      const memberByUserId = new Map(teamRows.map((t) => [String(t.member_user_id), t]));
      for (const sp of parsed.data.setup_permissions) {
        if (sp.member_user_id === ws) {
          return NextResponse.json({ error: "Cannot set setup permission for workspace owner" }, { status: 400 });
        }
        const tm = memberByUserId.get(sp.member_user_id);
        if (!tm?.id) {
          return NextResponse.json({ error: "Unknown team member for setup_permissions" }, { status: 400 });
        }
        const { data: existing } = await supabase
          .from("team_member_permissions")
          .select("team_member_id")
          .eq("team_member_id", tm.id)
          .maybeSingle();
        if (existing) {
          const { error: upErr } = await supabase
            .from("team_member_permissions")
            .update({ can_manage_business_setup: sp.can_manage_business_setup })
            .eq("team_member_id", tm.id);
          if (upErr) throw upErr;
        } else {
          const { error: insErr } = await supabase.from("team_member_permissions").insert({
            team_member_id: tm.id,
            can_manage_business_setup: sp.can_manage_business_setup,
          });
          if (insErr) throw insErr;
        }
      }
    }

    const { error: delErr } = await supabase
      .from("workspace_department_assignments")
      .delete()
      .eq("workspace_owner_id", ws);
    if (delErr) throw delErr;

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("workspace_department_assignments").insert(rows);
      if (insErr) throw insErr;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = errorMessageFromUnknown(e);
    console.error("[business-setup PATCH]", e);
    if (viewerId) {
      void capturePostHogServerEvent(viewerId, "business_setup_api_error", {
        method: "PATCH",
        http_status: 500,
        error_message: msg,
        route: "/api/workspace/business-setup",
      });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
