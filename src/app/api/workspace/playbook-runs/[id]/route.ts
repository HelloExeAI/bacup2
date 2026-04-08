import { NextResponse } from "next/server";
import { z } from "zod";

import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  step_id: z.string().uuid(),
  is_done: z.boolean(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
    if (denied) return denied;
    const wctx = await resolveWorkspaceContext(supabase, user.id);
    const ws = wctx.workspaceOwnerId;

    const { data: run, error: rErr } = await supabase
      .from("workspace_playbook_runs")
      .select("id,template_id,status,started_at,completed_at")
      .eq("id", id)
      .eq("workspace_owner_id", ws)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: tpl } = await supabase
      .from("workspace_playbook_templates")
      .select("name")
      .eq("id", run.template_id as string)
      .maybeSingle();

    const { data: steps, error: sErr } = await supabase
      .from("workspace_playbook_template_steps")
      .select("id,sort_order,title,detail")
      .eq("template_id", run.template_id as string)
      .order("sort_order", { ascending: true });
    if (sErr) throw sErr;

    const { data: prog, error: pErr } = await supabase
      .from("workspace_playbook_run_progress")
      .select("step_id,is_done")
      .eq("run_id", id);
    if (pErr) throw pErr;
    const doneMap = new Map((prog ?? []).map((p) => [p.step_id as string, p.is_done as boolean]));

    return NextResponse.json({
      run: {
        ...run,
        template_name: tpl?.name ?? "Playbook",
      },
      steps: (steps ?? []).map((s) => ({
        ...s,
        is_done: doneMap.get(s.id as string) ?? false,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
    if (denied) return denied;
    const wctx = await resolveWorkspaceContext(supabase, user.id);
    if (user.id !== wctx.workspaceOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const json = await req.json().catch(() => null);
    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { error: uErr } = await supabase
      .from("workspace_playbook_run_progress")
      .update({ is_done: parsed.data.is_done, updated_at: new Date().toISOString() })
      .eq("run_id", id)
      .eq("step_id", parsed.data.step_id);
    if (uErr) throw uErr;

    const { data: progress } = await supabase
      .from("workspace_playbook_run_progress")
      .select("is_done")
      .eq("run_id", id);
    const allDone = (progress ?? []).length > 0 && (progress ?? []).every((p) => p.is_done);
    if (allDone) {
      await supabase
        .from("workspace_playbook_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("workspace_owner_id", wctx.workspaceOwnerId);
    }

    return NextResponse.json({ ok: true, completed: allDone });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
