import { NextResponse } from "next/server";
import { z } from "zod";

import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

const ActionItemSchema = z.object({
  title: z.string().trim().min(1).max(500),
  owner_label: z.string().max(200).optional(),
  due_date: z.string().max(32).optional(),
});

const PatchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
  calendar_event_id: z.string().max(500).nullable().optional(),
  phase: z.enum(["planned", "completed"]).optional(),
  before_agenda: z.string().max(16000).nullable().optional(),
  before_decisions_needed: z.string().max(16000).nullable().optional(),
  after_decisions_summary: z.string().max(16000).nullable().optional(),
  after_action_items: z.array(ActionItemSchema).max(50).optional(),
});

type Params = { params: Promise<{ id: string }> };

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

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const d = parsed.data;
    if (d.title !== undefined) patch.title = d.title;
    if (d.scheduled_at !== undefined) patch.scheduled_at = d.scheduled_at;
    if (d.calendar_event_id !== undefined) patch.calendar_event_id = d.calendar_event_id;
    if (d.phase !== undefined) {
      patch.phase = d.phase;
      if (d.phase === "completed") {
        patch.completed_at = new Date().toISOString();
      }
    }
    if (d.before_agenda !== undefined) patch.before_agenda = d.before_agenda;
    if (d.before_decisions_needed !== undefined) patch.before_decisions_needed = d.before_decisions_needed;
    if (d.after_decisions_summary !== undefined) patch.after_decisions_summary = d.after_decisions_summary;
    if (d.after_action_items !== undefined) patch.after_action_items = d.after_action_items;

    const { error } = await supabase
      .from("workspace_meetings")
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
      .from("workspace_meetings")
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
