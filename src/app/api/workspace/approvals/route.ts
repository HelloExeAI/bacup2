import { NextResponse } from "next/server";
import { z } from "zod";

import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/lib/workspace/resolveWorkspace";

export const dynamic = "force-dynamic";

const TemplateTypeSchema = z.enum(["leave", "travel", "purchase"]);

const PostSchema = z.object({
  template_type: TemplateTypeSchema,
  title: z.string().trim().min(1).max(500),
  needed_by: z.string().datetime().optional(),
  decision_deadline: z.string().datetime().optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  cost_total_cents: z.number().int().nonnegative().optional(),
  summary_json: z.object({}).passthrough().optional(),
  template_json: z.object({}).passthrough().optional(),
  approver_user_id: z.string().uuid().optional(),
});

function pickManagerId(edges: Array<{ manager_user_id: string; relation_rank: number }>) {
  if (edges.length !== 1) return null;
  return edges[0]?.manager_user_id ?? null;
}

export async function GET(req: Request) {
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
    const ws = ctx.workspaceOwnerId;

    const url = new URL(req.url);
    const view = (url.searchParams.get("view") || "").trim(); // inbox|mine|all
    const status = (url.searchParams.get("status") || "").trim(); // pending, etc.

    let q = supabase
      .from("workspace_approvals")
      .select(
        "id,workspace_owner_id,requester_user_id,approver_user_id,template_type,title,status,currency,cost_total_cents,needed_by,decision_deadline,routing_reason,decision_note,decided_at,decided_by,created_at,updated_at",
      )
      .eq("workspace_owner_id", ws)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (status) q = q.eq("status", status);

    if (view === "inbox") q = q.eq("approver_user_id", user.id);
    else if (view === "mine") q = q.eq("requester_user_id", user.id);
    else if (view === "all" && user.id === ws) {
      // ok
    } else {
      // default: show inbox + mine (RLS also enforces)
      q = q.or(`requester_user_id.eq.${user.id},approver_user_id.eq.${user.id}`);
    }

    const { data, error } = await q;
    if (error) throw error;

    return NextResponse.json({ approvals: data ?? [] });
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
    const ws = ctx.workspaceOwnerId;

    const json = await req.json().catch(() => null);
    const parsed = PostSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    // Approver routing: manager -> fallback owner; allow manual override.
    let approver_user_id: string | null = parsed.data.approver_user_id ?? null;
    let routing_reason = approver_user_id ? "manual_override" : "org_manager";

    if (!approver_user_id) {
      const { data: edges, error: edgeErr } = await supabase
        .from("org_reporting_edges")
        .select("manager_user_id,relation_rank")
        .eq("workspace_owner_id", ws)
        .eq("report_user_id", user.id)
        .order("relation_rank", { ascending: true });
      if (edgeErr) throw edgeErr;
      const manager = pickManagerId((edges ?? []) as Array<{ manager_user_id: string; relation_rank: number }>);
      if (manager) {
        approver_user_id = manager;
        routing_reason = "org_manager";
      } else {
        approver_user_id = ws;
        routing_reason = (edges ?? []).length > 1 ? "ambiguous_manager_fallback_owner" : "no_manager_fallback_owner";
      }
    }

    const insertRow = {
      workspace_owner_id: ws,
      requester_user_id: user.id,
      approver_user_id,
      template_type: parsed.data.template_type,
      title: parsed.data.title,
      needed_by: parsed.data.needed_by ?? null,
      decision_deadline: parsed.data.decision_deadline ?? null,
      currency: parsed.data.currency ?? null,
      cost_total_cents: typeof parsed.data.cost_total_cents === "number" ? parsed.data.cost_total_cents : null,
      summary_json: parsed.data.summary_json ?? {},
      template_json: parsed.data.template_json ?? {},
      routing_reason,
    };

    const { data, error } = await supabase.from("workspace_approvals").insert(insertRow).select("id").single();
    if (error) throw error;

    const approvalId = data?.id as string | undefined;
    if (approvalId) {
      await supabase.from("workspace_approval_events").insert({
        workspace_owner_id: ws,
        approval_id: approvalId,
        actor_user_id: user.id,
        event_type: "created",
        note: null,
        payload_json: { template_type: parsed.data.template_type, routing_reason },
      });
    }

    return NextResponse.json({ id: approvalId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

