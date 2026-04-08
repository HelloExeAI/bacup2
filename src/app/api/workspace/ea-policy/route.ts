import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

const PutSchema = z.object({
  ea_user_id: z.string().uuid(),
  can_view_email_derived_tasks: z.boolean(),
  can_view_calendar_summary: z.boolean(),
  can_view_decisions: z.boolean(),
  can_view_projects: z.boolean(),
  can_view_recognition_feed: z.boolean(),
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
    if (user.id !== ctx.workspaceOwnerId) {
      return NextResponse.json({ error: "Only the workspace owner can view EA policies" }, { status: 403 });
    }
    const { data, error } = await supabase
      .from("ea_access_policies")
      .select("*")
      .eq("workspace_owner_id", ctx.workspaceOwnerId);
    if (error) throw error;
    return NextResponse.json({ policies: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const json = await req.json().catch(() => null);
    const parsed = PutSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const { error } = await supabase.from("ea_access_policies").upsert(
      {
        workspace_owner_id: ctx.workspaceOwnerId,
        ea_user_id: parsed.data.ea_user_id,
        can_view_email_derived_tasks: parsed.data.can_view_email_derived_tasks,
        can_view_calendar_summary: parsed.data.can_view_calendar_summary,
        can_view_decisions: parsed.data.can_view_decisions,
        can_view_projects: parsed.data.can_view_projects,
        can_view_recognition_feed: parsed.data.can_view_recognition_feed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_owner_id,ea_user_id", ignoreDuplicates: false },
    );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
