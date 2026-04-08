import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
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
      .from("company_values")
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
