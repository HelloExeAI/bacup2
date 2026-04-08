import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

const PostSchema = z.object({
  title: z.string().trim().min(1).max(500),
  context_notes: z.string().max(8000).optional(),
  priority: z.number().int().min(1).max(3).optional(),
});

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
    const { data, error } = await supabase
      .from("workspace_decisions")
      .select("*")
      .eq("workspace_owner_id", ctx.workspaceOwnerId)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ decisions: data ?? [] });
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
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ctx = await resolveWorkspaceContext(supabase, user.id);
    if (user.id !== ctx.workspaceOwnerId) {
      return NextResponse.json({ error: "Only the workspace owner can add decisions" }, { status: 403 });
    }
    const json = await req.json().catch(() => null);
    const parsed = PostSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("workspace_decisions")
      .insert({
        workspace_owner_id: ctx.workspaceOwnerId,
        title: parsed.data.title,
        context_notes: parsed.data.context_notes ?? null,
        priority: parsed.data.priority ?? 2,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ id: data?.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
