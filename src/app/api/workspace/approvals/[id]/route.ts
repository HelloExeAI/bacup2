import { NextResponse } from "next/server";
import { z } from "zod";

import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  needed_by: z.union([z.string().datetime(), z.null()]).optional(),
  decision_deadline: z.union([z.string().datetime(), z.null()]).optional(),
  currency: z.union([z.string().trim().min(1).max(8), z.null()]).optional(),
  cost_total_cents: z.union([z.number().int().nonnegative(), z.null()]).optional(),
  summary_json: z.object({}).passthrough().optional(),
  template_json: z.object({}).passthrough().optional(),
  status: z.enum(["pending", "cancelled"]).optional(),
});

export async function GET(_req: Request, segment: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await segment.params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
    if (denied) return denied;

    const ctx = await resolveWorkspaceContext(supabase, user.id);
    const ws = ctx.workspaceOwnerId;

    const { data: approval, error } = await supabase
      .from("workspace_approvals")
      .select("*")
      .eq("workspace_owner_id", ws)
      .eq("id", id)
      .single();
    if (error) throw error;

    const { data: events } = await supabase
      .from("workspace_approval_events")
      .select("id,actor_user_id,event_type,note,payload_json,created_at")
      .eq("workspace_owner_id", ws)
      .eq("approval_id", id)
      .order("created_at", { ascending: false })
      .limit(100);

    return NextResponse.json({ approval, events: events ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request, segment: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await segment.params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
    if (denied) return denied;

    const ctx = await resolveWorkspaceContext(supabase, user.id);
    const ws = ctx.workspaceOwnerId;

    const json = await req.json().catch(() => null);
    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const patch = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>;

    // Track edits in timeline (best-effort).
    const { data: before } = await supabase
      .from("workspace_approvals")
      .select("status")
      .eq("workspace_owner_id", ws)
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabase.from("workspace_approvals").update(patch).eq("workspace_owner_id", ws).eq("id", id);
    if (error) throw error;

    const eventType =
      parsed.data.status && parsed.data.status === "cancelled"
        ? "cancelled"
        : before?.status === "needs_changes" && parsed.data.status === "pending"
          ? "resubmitted"
          : "edited";

    await supabase.from("workspace_approval_events").insert({
      workspace_owner_id: ws,
      approval_id: id,
      actor_user_id: user.id,
      event_type: eventType,
      note: null,
      payload_json: { patch: parsed.data },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

