import { NextResponse } from "next/server";

import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
  if (denied) return denied;

  const { data: ev, error: fe } = await supabase
    .from("follow_reply_events")
    .select("id,task_id,intent,task_snapshot_before,undone_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fe || !ev) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ev.undone_at) return NextResponse.json({ error: "Already undone" }, { status: 400 });

  const taskId = ev.task_id as string | null;
  if (!taskId) return NextResponse.json({ error: "No task" }, { status: 400 });

  const snap = ev.task_snapshot_before as Record<string, unknown> | null;
  if (!snap || typeof snap !== "object") {
    return NextResponse.json({ error: "Missing snapshot" }, { status: 400 });
  }

  const { error: upErr } = await supabase
    .from("tasks")
    .update({
      status: snap.status,
      assigned_to: snap.assigned_to,
      description: snap.description,
      due_date: snap.due_date,
      due_time: snap.due_time,
      completed_at: snap.completed_at,
      completed_by_name: snap.completed_by_name,
    })
    .eq("id", taskId)
    .eq("user_id", user.id);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  if (ev.intent === "done") {
    await supabase.from("task_follow_subscription").update({ enabled: true }).eq("task_id", taskId).eq("user_id", user.id);
  }

  await supabase.from("follow_reply_events").update({ undone_at: new Date().toISOString() }).eq("id", id);

  return NextResponse.json({ ok: true });
}
