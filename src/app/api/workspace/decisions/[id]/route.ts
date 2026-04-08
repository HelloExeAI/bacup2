import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  context_notes: z.union([z.string().max(8000), z.null()]).optional(),
  status: z.enum(["pending", "decided", "deferred"]).optional(),
  priority: z.number().int().min(1).max(3).optional(),
});

export async function PATCH(req: Request, segment: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await segment.params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const wctx = await resolveWorkspaceContext(supabase, user.id);
    if (user.id !== wctx.workspaceOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const json = await req.json().catch(() => null);
    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const patch = { ...parsed.data, updated_at: new Date().toISOString() };
    const { error } = await supabase
      .from("workspace_decisions")
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

export async function DELETE(_req: Request, segment: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await segment.params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const wctx = await resolveWorkspaceContext(supabase, user.id);
    if (user.id !== wctx.workspaceOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { error } = await supabase
      .from("workspace_decisions")
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
