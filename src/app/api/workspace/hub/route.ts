import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchDashboardTasksByView } from "@/lib/supabase/queries";
import { defaultEaPolicy, type EaAccessPolicyRow } from "@/lib/workspace/eaAccess";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";
import { isTaskOverdue } from "@/lib/tasks/taskOverdue";
import type { Task } from "@/store/taskStore";

export const dynamic = "force-dynamic";

function ymdToday(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function briefStats(tasks: Task[]) {
  const today = ymdToday();
  const now = new Date();
  const pending = tasks.filter((t) => t.status === "pending");
  return {
    overdue: pending.filter((t) => isTaskOverdue(t, now)).length,
    todaysLoad: pending.filter((t) => t.due_date === today).length,
    waitingFollowups: pending.filter((t) => t.type === "followup").length,
    activePriorities: pending.filter((t) => t.type === "todo").length,
  };
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ctx = await resolveWorkspaceContext(supabase, user.id);
    const ws = ctx.workspaceOwnerId;

    let eaPolicy: EaAccessPolicyRow | null = null;
    if (ctx.isEa && ctx.workspaceOwnerId !== user.id) {
      const { data: pol } = await supabase
        .from("ea_access_policies")
        .select("*")
        .eq("workspace_owner_id", ws)
        .eq("ea_user_id", user.id)
        .maybeSingle();
      eaPolicy = pol
        ? (pol as EaAccessPolicyRow)
        : defaultEaPolicy(ws, user.id);
    }

    const hideDecisions = ctx.isEa && eaPolicy && !eaPolicy.can_view_decisions;
    const hideProjects = ctx.isEa && eaPolicy && !eaPolicy.can_view_projects;
    const hideRecognition = ctx.isEa && eaPolicy && !eaPolicy.can_view_recognition_feed;

    const myTasks = await fetchDashboardTasksByView(supabase, user.id, user.id);
    const morningBrief = briefStats(myTasks);

    const [decisionsRes, projectsRes, valuesRes, recRes, orgRes] = await Promise.all([
      hideDecisions
        ? Promise.resolve({ data: [] as unknown[] })
        : supabase
            .from("workspace_decisions")
            .select("id,title,context_notes,status,priority,created_at,updated_at")
            .eq("workspace_owner_id", ws)
            .order("priority", { ascending: true })
            .order("created_at", { ascending: false })
            .limit(20),
      hideProjects
        ? Promise.resolve({ data: [] as unknown[] })
        : supabase
            .from("workspace_projects")
            .select("id,name,health_status,summary,owner_user_id,sort_order,updated_at")
            .eq("workspace_owner_id", ws)
            .order("sort_order", { ascending: true })
            .limit(50),
      supabase
        .from("company_values")
        .select("id,label,sort_order")
        .eq("workspace_owner_id", ws)
        .order("sort_order", { ascending: true }),
      hideRecognition
        ? Promise.resolve({ data: [] as unknown[] })
        : supabase
            .from("workspace_recognitions")
            .select("id,from_user_id,to_user_id,message,value_id,created_at")
            .eq("workspace_owner_id", ws)
            .order("created_at", { ascending: false })
            .limit(15),
      supabase
        .from("org_reporting_edges")
        .select("id,report_user_id,manager_user_id,relation_rank")
        .eq("workspace_owner_id", ws),
    ]);

    const pendingDecisions =
      !hideDecisions && Array.isArray(decisionsRes.data)
        ? (decisionsRes.data as { status: string }[]).filter((d) => d.status === "pending").length
        : 0;

    return NextResponse.json({
      context: {
        workspaceOwnerId: ws,
        viewerRole: ctx.viewerRole,
        isFounder: ctx.isFounder,
        isEa: ctx.isEa,
        eaPolicy: ctx.isEa ? eaPolicy ?? defaultEaPolicy(ws, user.id) : null,
      },
      emailPolicyNote:
        "Inbox uses today-only fetch; bodies are not stored. Subject lines may be saved as task labels. Past mail is reached via search, not day browsing.",
      morningBrief: {
        ...morningBrief,
        pendingDecisions,
      },
      decisions: hideDecisions ? [] : decisionsRes.data ?? [],
      projects: hideProjects ? [] : projectsRes.data ?? [],
      companyValues: valuesRes.data ?? [],
      recognitions: hideRecognition ? [] : recRes.data ?? [],
      orgEdges: orgRes.data ?? [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "hub_failed";
    console.error("[workspace/hub]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
