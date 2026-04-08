import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

const PostSchema = z.object({
  report_user_id: z.string().uuid(),
  manager_user_id: z.string().uuid(),
  relation_rank: z.number().int().min(1).max(3).optional(),
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
      return NextResponse.json({ error: "Only the workspace owner can edit org" }, { status: 403 });
    }
    const json = await req.json().catch(() => null);
    const parsed = PostSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("org_reporting_edges")
      .insert({
        workspace_owner_id: ctx.workspaceOwnerId,
        report_user_id: parsed.data.report_user_id,
        manager_user_id: parsed.data.manager_user_id,
        relation_rank: parsed.data.relation_rank ?? 1,
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
