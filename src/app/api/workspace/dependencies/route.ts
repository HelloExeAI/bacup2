import { NextResponse } from "next/server";
import { z } from "zod";

import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

const PostSchema = z.object({
  waiting_on_label: z.string().trim().min(1).max(200),
  blocked_party_label: z.string().trim().min(1).max(200),
  project_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(8000).optional(),
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

    const { data, error } = await supabase
      .from("workspace_cross_team_dependencies")
      .select("id,waiting_on_label,blocked_party_label,project_id,status,notes,created_at,updated_at")
      .eq("workspace_owner_id", ctx.workspaceOwnerId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ dependencies: data ?? [] });
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
      return NextResponse.json({ error: "Only the workspace owner can add dependencies" }, { status: 403 });
    }
    const json = await req.json().catch(() => null);
    const parsed = PostSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("workspace_cross_team_dependencies")
      .insert({
        workspace_owner_id: ctx.workspaceOwnerId,
        waiting_on_label: parsed.data.waiting_on_label,
        blocked_party_label: parsed.data.blocked_party_label,
        project_id: parsed.data.project_id ?? null,
        notes: parsed.data.notes ?? null,
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
