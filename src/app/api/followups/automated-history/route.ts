import { NextResponse } from "next/server";

import type { AutomatedFollowupHistoryItem } from "@/lib/followups/automatedHistoryTypes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: taskRows, error: tasksErr } = await supabase
    .from("tasks")
    .select("id,title,assigned_to,status,automate_followup_sent_at")
    .eq("user_id", user.id)
    .not("automate_followup_sent_at", "is", null)
    .order("automate_followup_sent_at", { ascending: false })
    .limit(100);

  if (tasksErr) {
    return NextResponse.json({ error: "load_failed", details: tasksErr.message }, { status: 500 });
  }

  const tasks = taskRows ?? [];
  const taskIds = tasks.map((t) => t.id as string).filter(Boolean);
  const latestByTask = new Map<
    string,
    { status_label: string; created_at: string; raw_text: string | null }
  >();

  if (taskIds.length > 0) {
    const { data: evRows, error: evErr } = await supabase
      .from("follow_reply_events")
      .select("task_id,status_label,created_at,raw_text,source")
      .eq("user_id", user.id)
      .eq("source", "web_link")
      .in("task_id", taskIds)
      .order("created_at", { ascending: false });

    if (evErr) {
      return NextResponse.json({ error: "events_failed", details: evErr.message }, { status: 500 });
    }

    for (const ev of evRows ?? []) {
      const tid = ev.task_id as string | null;
      if (!tid || latestByTask.has(tid)) continue;
      latestByTask.set(tid, {
        status_label: String(ev.status_label ?? ""),
        created_at: String(ev.created_at ?? ""),
        raw_text: typeof ev.raw_text === "string" ? ev.raw_text : null,
      });
    }
  }

  const items: AutomatedFollowupHistoryItem[] = tasks.map((t) => {
    const id = t.id as string;
    const latest = latestByTask.get(id);
    const preview = latest?.raw_text?.trim().slice(0, 120) ?? null;
    return {
      task_id: id,
      title: String(t.title ?? ""),
      assigned_to: String(t.assigned_to ?? ""),
      task_status: String(t.status ?? ""),
      sent_at: String(t.automate_followup_sent_at ?? ""),
      latest_web_status_label: latest?.status_label ?? null,
      latest_web_event_at: latest?.created_at ?? null,
      latest_web_preview: preview && preview.length > 0 ? preview : null,
    };
  });

  return NextResponse.json({ items });
}
