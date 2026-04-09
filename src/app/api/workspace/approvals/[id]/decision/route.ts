import { NextResponse } from "next/server";
import { z } from "zod";

import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  decision: z.enum(["approved", "rejected", "needs_changes"]),
  decision_note: z.string().trim().max(8000).optional(),
});

export async function POST(req: Request, segment: { params: Promise<{ id: string }> }) {
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
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const note = parsed.data.decision_note?.trim() || null;
    if ((parsed.data.decision === "rejected" || parsed.data.decision === "needs_changes") && !note) {
      return NextResponse.json({ error: "Decision note required for reject / changes" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const patch = {
      status: parsed.data.decision,
      decision_note: note,
      decided_at: now,
      decided_by: user.id,
      updated_at: now,
    };

    const { error } = await supabase
      .from("workspace_approvals")
      .update(patch)
      .eq("workspace_owner_id", ws)
      .eq("id", id);
    if (error) throw error;

    await supabase.from("workspace_approval_events").insert({
      workspace_owner_id: ws,
      approval_id: id,
      actor_user_id: user.id,
      event_type: parsed.data.decision,
      note,
      payload_json: {},
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

