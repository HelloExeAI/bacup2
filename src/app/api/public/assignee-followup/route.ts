import { NextResponse } from "next/server";
import { z } from "zod";

import { formatFollowReplyDescriptionAppend } from "@/lib/workspace/followReplyComment";
import type { FollowReplyStatusLabel } from "@/lib/workspace/followReplyParse";
import { hashAssigneeFollowupToken } from "@/lib/followups/assigneeFollowupToken";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTrustedDbClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const PostSchema = z
  .object({
    token: z.string().min(10).max(500),
    updates: z
      .array(
        z.object({
          task_id: z.string().uuid(),
          status: z.enum(["completed", "in_progress", "not_started"]),
          note: z.string().max(4000).optional(),
        }),
      )
      .min(1)
      .max(50),
  })
  .strict();

type TokenRow = {
  id: string;
  owner_user_id: string;
  assignee_email: string;
  task_ids: string[];
  expires_at: string;
  revoked_at: string | null;
};

function mapWebStatus(status: z.infer<typeof PostSchema>["updates"][0]["status"]): {
  intent: "done" | "in_progress" | "noop";
  status_label: FollowReplyStatusLabel;
} {
  if (status === "completed") return { intent: "done", status_label: "completed" };
  if (status === "in_progress") return { intent: "in_progress", status_label: "in_progress" };
  return { intent: "noop", status_label: "not_started" };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  if (token.length < 10) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const authClient = await createSupabaseServerClient();
  const db = getTrustedDbClient(authClient);
  const tokenHash = hashAssigneeFollowupToken(token);

  const { data: row, error } = await db
    .from("assignee_followup_tokens")
    .select("id,owner_user_id,assignee_email,task_ids,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const tr = row as TokenRow;
  if (tr.revoked_at) return NextResponse.json({ error: "revoked" }, { status: 410 });
  if (new Date(tr.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  const ids = tr.task_ids ?? [];
  if (ids.length === 0) return NextResponse.json({ error: "no_tasks" }, { status: 404 });

  const { data: tasks, error: tErr } = await db
    .from("tasks")
    .select("id,title,status")
    .eq("user_id", tr.owner_user_id)
    .in("id", ids);

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const list = (tasks ?? [])
    .filter((t) => t.status === "pending")
    .map((t) => ({ id: t.id as string, title: String(t.title ?? "") }));

  list.sort((a, b) => a.title.localeCompare(b.title));

  return NextResponse.json({
    assignee_email: tr.assignee_email,
    expires_at: tr.expires_at,
    tasks: list,
  });
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const authClient = await createSupabaseServerClient();
  const db = getTrustedDbClient(authClient);
  const tokenHash = hashAssigneeFollowupToken(parsed.data.token);

  const { data: row, error } = await db
    .from("assignee_followup_tokens")
    .select("id,owner_user_id,assignee_email,task_ids,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const tr = row as TokenRow;
  if (tr.revoked_at) return NextResponse.json({ error: "revoked" }, { status: 410 });
  if (new Date(tr.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  const allowed = new Set(tr.task_ids.map(String));
  for (const u of parsed.data.updates) {
    if (!allowed.has(u.task_id)) {
      return NextResponse.json({ error: "task_not_in_token", task_id: u.task_id }, { status: 400 });
    }
  }

  const nowIso = new Date().toISOString();

  const statusWords: Record<z.infer<typeof PostSchema>["updates"][0]["status"], string> = {
    completed: "Completed",
    in_progress: "In progress",
    not_started: "Not started",
  };

  for (const u of parsed.data.updates) {
    const { intent, status_label } = mapWebStatus(u.status);
    const note = (u.note ?? "").trim();
    const rawText = (note || `${statusWords[u.status]} (via update link)`).slice(0, 8000);

    const { data: task, error: taskErr } = await db
      .from("tasks")
      .select("id,status,assigned_to,description,due_date,due_time,completed_at,completed_by_name,user_id")
      .eq("id", u.task_id)
      .eq("user_id", tr.owner_user_id)
      .maybeSingle();

    if (taskErr || !task || task.status !== "pending") {
      return NextResponse.json({ error: "task_not_found", task_id: u.task_id }, { status: 400 });
    }

    const before = {
      status: String(task.status),
      assigned_to: task.assigned_to ?? null,
      description: task.description ?? null,
      due_date: task.due_date ?? null,
      due_time: task.due_time ?? null,
      completed_at: task.completed_at ?? null,
      completed_by_name: task.completed_by_name ?? null,
    };

    const commentBlock = formatFollowReplyDescriptionAppend(status_label, note || rawText);

    const updates: Record<string, unknown> = {};
    let taskUpdates: Record<string, unknown> = {};

    if (intent === "done") {
      updates.status = "done";
      updates.completed_at = nowIso;
      updates.completed_by_name = "Assignee link";
      updates.description = `${before.description ?? ""}\n\n${commentBlock}`.trim();
      updates.last_edited_by_name = "Assignee link";
      taskUpdates = { status: "done", description: updates.description };
    } else if (intent === "in_progress") {
      updates.description = `${before.description ?? ""}\n\n${commentBlock}`.trim();
      updates.last_edited_by_name = "Assignee link";
      taskUpdates = { description: updates.description };
    } else {
      updates.description = `${before.description ?? ""}\n\n${commentBlock}`.trim();
      updates.last_edited_by_name = "Assignee link";
      taskUpdates = { description: updates.description };
    }

    const { error: upErr } = await db.from("tasks").update(updates).eq("id", u.task_id).eq("user_id", tr.owner_user_id);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    if (intent === "done") {
      await db
        .from("task_follow_subscription")
        .update({ enabled: false })
        .eq("task_id", u.task_id)
        .eq("user_id", tr.owner_user_id);
    }

    const { error: insErr } = await db.from("follow_reply_events").insert({
      user_id: tr.owner_user_id,
      task_id: u.task_id,
      subscription_id: null,
      outbound_log_id: null,
      gmail_message_id: null,
      gmail_thread_id: null,
      from_email_preview: tr.assignee_email.slice(0, 320),
      raw_text: rawText || commentBlock,
      intent,
      status_label,
      source: "web_link",
      assignee_followup_token_id: tr.id,
      task_snapshot_before: before as unknown as Record<string, unknown>,
      task_updates_applied: taskUpdates,
    });

    if (insErr) {
      await db.from("tasks").update(before as Record<string, unknown>).eq("id", u.task_id).eq("user_id", tr.owner_user_id);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
