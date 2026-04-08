import { NextResponse } from "next/server";
import { z } from "zod";

import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

const PostSchema = z.object({
  title: z.string().trim().min(1).max(300),
  scheduled_at: z.string().datetime().nullable().optional(),
  calendar_event_id: z.string().max(500).nullable().optional(),
  before_agenda: z.string().max(16000).optional(),
  before_decisions_needed: z.string().max(16000).optional(),
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
      .from("workspace_meetings")
      .select(
        "id,title,scheduled_at,calendar_event_id,phase,before_agenda,before_decisions_needed,after_decisions_summary,after_action_items,created_at,updated_at,completed_at",
      )
      .eq("workspace_owner_id", ctx.workspaceOwnerId)
      .order("scheduled_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ meetings: data ?? [] });
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
      return NextResponse.json({ error: "Only the workspace owner can create meetings" }, { status: 403 });
    }
    const json = await req.json().catch(() => null);
    const parsed = PostSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("workspace_meetings")
      .insert({
        workspace_owner_id: ctx.workspaceOwnerId,
        title: parsed.data.title,
        scheduled_at: parsed.data.scheduled_at ?? null,
        calendar_event_id: parsed.data.calendar_event_id ?? null,
        before_agenda: parsed.data.before_agenda ?? null,
        before_decisions_needed: parsed.data.before_decisions_needed ?? null,
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
