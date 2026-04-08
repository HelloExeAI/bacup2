import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

const PostSchema = z.object({
  name: z.string().trim().min(1).max(200),
  summary: z.string().max(4000).optional(),
  health_status: z.enum(["green", "yellow", "red", "unknown"]).optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().optional(),
});

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
      return NextResponse.json({ error: "Only the workspace owner can add projects" }, { status: 403 });
    }
    const json = await req.json().catch(() => null);
    const parsed = PostSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("workspace_projects")
      .insert({
        workspace_owner_id: ctx.workspaceOwnerId,
        name: parsed.data.name,
        summary: parsed.data.summary ?? null,
        health_status: parsed.data.health_status ?? "unknown",
        owner_user_id: parsed.data.owner_user_id ?? null,
        sort_order: parsed.data.sort_order ?? 0,
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
