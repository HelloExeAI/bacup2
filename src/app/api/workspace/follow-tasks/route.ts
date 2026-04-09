import { NextResponse } from "next/server";
import { z } from "zod";

import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PostSchema = z.object({
  task_id: z.string().uuid(),
  assignee_email: z.string().trim().email(),
  /** ISO deadline for “expect a reply by”; defaults from server settings + task. */
  response_deadline_at: z.string().datetime().optional(),
  reminder_interval_minutes: z.number().int().min(5).max(10080).optional(),
});

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
  if (denied) return denied;

  const url = new URL(req.url);
  const taskId = url.searchParams.get("taskId")?.trim();

  if (taskId && /^[0-9a-f-]{36}$/i.test(taskId)) {
    const { data } = await supabase
      .from("task_follow_subscription")
      .select("*")
      .eq("user_id", user.id)
      .eq("task_id", taskId)
      .maybeSingle();
    return NextResponse.json({ subscription: data ?? null });
  }

  const { data, error } = await supabase
    .from("task_follow_subscription")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscriptions: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
  if (denied) return denied;

  const json = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { task_id, assignee_email, response_deadline_at: clientDeadline, reminder_interval_minutes } = parsed.data;

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select("id,status")
    .eq("id", task_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (taskErr || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (task.status !== "pending") {
    return NextResponse.json({ error: "Only pending tasks can be enrolled." }, { status: 400 });
  }

  const { data: st } = await supabase.from("workspace_follow_settings").select("*").eq("user_id", user.id).maybeSingle();

  const defaultHours = typeof st?.default_response_hours === "number" ? Number(st.default_response_hours) : 2;
  let deadlineIso: string;
  if (clientDeadline) {
    deadlineIso = new Date(clientDeadline).toISOString();
  } else {
    deadlineIso = new Date(Date.now() + defaultHours * 3600 * 1000).toISOString();
  }

  const nextReminder = new Date(Date.now() + 60 * 1000).toISOString();
  const interval = reminder_interval_minutes ?? (typeof st?.reminder_interval_minutes === "number" ? st.reminder_interval_minutes : 120);

  const row = {
    user_id: user.id,
    task_id,
    enabled: true,
    assignee_email,
    response_deadline_at: deadlineIso,
    next_reminder_at: nextReminder,
    reminder_interval_minutes: interval,
  };

  const { data: existing } = await supabase
    .from("task_follow_subscription")
    .select("id")
    .eq("user_id", user.id)
    .eq("task_id", task_id)
    .maybeSingle();

  const { data, error } = existing?.id
    ? await supabase.from("task_follow_subscription").update(row).eq("id", existing.id).select("*").single()
    : await supabase.from("task_follow_subscription").insert(row).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscription: data });
}

export async function DELETE(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
  if (denied) return denied;

  const url = new URL(req.url);
  const taskId = url.searchParams.get("taskId")?.trim();
  if (!taskId) {
    return NextResponse.json({ error: "taskId required" }, { status: 400 });
  }

  const { error } = await supabase.from("task_follow_subscription").delete().eq("user_id", user.id).eq("task_id", taskId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
