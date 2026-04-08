import { NextResponse } from "next/server";
import { z } from "zod";

import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

const StepSchema = z.object({
  title: z.string().trim().min(1).max(500),
  detail: z.string().max(8000).optional(),
});

const PostSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(8000).optional(),
  cadence_label: z.string().max(120).optional(),
  steps: z.array(StepSchema).min(1).max(80),
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

    const { data: templates, error: tErr } = await supabase
      .from("workspace_playbook_templates")
      .select("id,name,description,cadence_label,created_at")
      .eq("workspace_owner_id", ws)
      .order("created_at", { ascending: false });
    if (tErr) throw tErr;

    const ids = (templates ?? []).map((t) => t.id as string);
    if (ids.length === 0) {
      return NextResponse.json({ templates: [] });
    }

    const { data: steps, error: sErr } = await supabase
      .from("workspace_playbook_template_steps")
      .select("id,template_id,sort_order,title,detail")
      .in("template_id", ids)
      .order("sort_order", { ascending: true });
    if (sErr) throw sErr;

    const byTemplate = new Map<string, typeof steps>();
    for (const s of steps ?? []) {
      const tid = s.template_id as string;
      const arr = byTemplate.get(tid) ?? [];
      arr.push(s);
      byTemplate.set(tid, arr);
    }

    return NextResponse.json({
      templates: (templates ?? []).map((t) => ({
        ...t,
        steps: byTemplate.get(t.id as string) ?? [],
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
      return NextResponse.json({ error: "Only the workspace owner can create playbooks" }, { status: 403 });
    }
    const json = await req.json().catch(() => null);
    const parsed = PostSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const ws = ctx.workspaceOwnerId;

    const { data: row, error: insErr } = await supabase
      .from("workspace_playbook_templates")
      .insert({
        workspace_owner_id: ws,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        cadence_label: parsed.data.cadence_label ?? null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    const templateId = row?.id as string;

    const stepRows = parsed.data.steps.map((s, i) => ({
      template_id: templateId,
      sort_order: i,
      title: s.title,
      detail: s.detail ?? null,
    }));
    const { error: stepErr } = await supabase.from("workspace_playbook_template_steps").insert(stepRows);
    if (stepErr) throw stepErr;

    return NextResponse.json({ id: templateId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
