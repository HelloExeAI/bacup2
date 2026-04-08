import { NextResponse } from "next/server";
import { z } from "zod";

import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

const PostSchema = z.object({
  template_id: z.string().uuid(),
});

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
    if (denied) return denied;
    const ctx = await resolveWorkspaceContext(supabase, user.id);
    const ws = ctx.workspaceOwnerId;

    const { data: runs, error } = await supabase
      .from("workspace_playbook_runs")
      .select("id,template_id,status,started_at,completed_at,started_by")
      .eq("workspace_owner_id", ws)
      .order("started_at", { ascending: false })
      .limit(30);
    if (error) throw error;

    const templateIds = [...new Set((runs ?? []).map((r) => r.template_id as string))];
    let names: Record<string, string> = {};
    if (templateIds.length > 0) {
      const { data: tpls } = await supabase
        .from("workspace_playbook_templates")
        .select("id,name")
        .in("id", templateIds);
      names = Object.fromEntries((tpls ?? []).map((t) => [t.id as string, t.name as string]));
    }

    return NextResponse.json({
      runs: (runs ?? []).map((r) => ({
        ...r,
        template_name: names[r.template_id as string] ?? "Playbook",
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
    if (denied) return denied;
    const ctx = await resolveWorkspaceContext(supabase, user.id);
    if (user.id !== ctx.workspaceOwnerId) {
      return NextResponse.json({ error: "Only the workspace owner can start a run" }, { status: 403 });
    }
    const json = await req.json().catch(() => null);
    const parsed = PostSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const ws = ctx.workspaceOwnerId;
    const templateId = parsed.data.template_id;

    const { data: tpl, error: tErr } = await supabase
      .from("workspace_playbook_templates")
      .select("id")
      .eq("id", templateId)
      .eq("workspace_owner_id", ws)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!tpl) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const { data: steps, error: sErr } = await supabase
      .from("workspace_playbook_template_steps")
      .select("id")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true });
    if (sErr) throw sErr;
    if (!steps?.length) {
      return NextResponse.json({ error: "Template has no steps" }, { status: 400 });
    }

    const { data: run, error: rErr } = await supabase
      .from("workspace_playbook_runs")
      .insert({
        workspace_owner_id: ws,
        template_id: templateId,
        status: "active",
        started_by: user.id,
      })
      .select("id")
      .single();
    if (rErr) throw rErr;
    const runId = run?.id as string;

    const progressRows = steps.map((s) => ({
      run_id: runId,
      step_id: s.id as string,
      is_done: false,
    }));
    const { error: pErr } = await supabase.from("workspace_playbook_run_progress").insert(progressRows);
    if (pErr) throw pErr;

    return NextResponse.json({ id: runId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
