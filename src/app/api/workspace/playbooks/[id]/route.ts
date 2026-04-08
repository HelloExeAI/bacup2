import { NextResponse } from "next/server";
import { z } from "zod";

import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(8000).nullable().optional(),
  cadence_label: z.string().max(120).nullable().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Params) {
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

    const { error } = await supabase
      .from("workspace_playbook_templates")
      .delete()
      .eq("id", id)
      .eq("workspace_owner_id", wctx.workspaceOwnerId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
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
    const patch: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.description !== undefined) patch.description = parsed.data.description;
    if (parsed.data.cadence_label !== undefined) patch.cadence_label = parsed.data.cadence_label;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No changes" }, { status: 400 });
    }

    const { error } = await supabase
      .from("workspace_playbook_templates")
      .update(patch)
      .eq("id", id)
      .eq("workspace_owner_id", wctx.workspaceOwnerId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
