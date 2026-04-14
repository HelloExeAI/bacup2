import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchDashboardTasksByView,
  fetchDashboardViewOptions,
  type DashboardViewOption,
} from "@/lib/supabase/queries";
import { DEPARTMENT_LABEL, isWorkspaceDepartmentId } from "@/lib/workspace/departments";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";
import type { Task } from "@/store/taskStore";
import { isTaskOverdue } from "@/lib/tasks/taskOverdue";

const QuerySchema = z.object({
  view_user_id: z.string().uuid().optional(),
});

function ymdToday(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildKpis(tasks: Task[]) {
  const today = ymdToday();
  const now = new Date();
  const pending = tasks.filter((t) => t.status === "pending");
  return {
    overdue: pending.filter((t) => isTaskOverdue(t, now)).length,
    waitingResponses: pending.filter((t) => t.type === "followup").length,
    activePriorities: pending.filter((t) => t.type === "todo").length,
    todaysLoad: pending.filter((t) => t.due_date === today).length,
  };
}

export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      view_user_id: url.searchParams.get("view_user_id") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const access = await fetchDashboardViewOptions(supabase, user.id);
    const ctx = await resolveWorkspaceContext(supabase, user.id);
    const ws = ctx.workspaceOwnerId;

    const deptByUser = new Map<string, string>();
    try {
      const { data: drows } = await supabase
        .from("workspace_department_assignments")
        .select("user_id, department")
        .eq("workspace_owner_id", ws);
      for (const r of drows ?? []) {
        const uid = String((r as { user_id: string }).user_id);
        const d = String((r as { department: string }).department);
        if (isWorkspaceDepartmentId(d)) deptByUser.set(uid, d);
      }
    } catch {
      /* migration not applied */
    }

    const options: DashboardViewOption[] = access.options.map((o) => {
      const raw = deptByUser.get(o.user_id) ?? null;
      const d = raw && isWorkspaceDepartmentId(raw) ? raw : null;
      const department_label = d ? DEPARTMENT_LABEL[d] : null;
      return {
        ...o,
        department: d,
        department_label,
        label: department_label ? `${o.label} · ${department_label}` : o.label,
      };
    });

    const allowedOptionIds = new Set(options.map((o) => o.user_id));
    const requestedViewUserId = parsed.data.view_user_id ?? user.id;
    const selectedViewUserId = allowedOptionIds.has(requestedViewUserId)
      ? requestedViewUserId
      : user.id;

    const tasks = await fetchDashboardTasksByView(supabase, user.id, selectedViewUserId);
    return NextResponse.json({
      selectedViewUserId,
      canViewOthers: access.canViewOthers,
      viewOptions: options as DashboardViewOption[],
      kpis: buildKpis(tasks),
      tasks,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Dashboard overview failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

