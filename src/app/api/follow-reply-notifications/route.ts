import { NextResponse } from "next/server";

import { businessOsForbiddenIfNeeded } from "@/lib/billing/businessOsAccess";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type FollowReplyNotificationRow = {
  id: string;
  task_id: string | null;
  status_label: string;
  source: string;
  intent: string;
  raw_text: string;
  from_email_preview: string | null;
  read_at: string | null;
  created_at: string;
};

/** Recent assignee updates (email parse + web link) for the notification bell. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
  if (denied) return denied;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("follow_reply_events")
    .select("id,task_id,status_label,source,intent,raw_text,from_email_preview,read_at,created_at")
    .eq("user_id", user.id)
    .is("undone_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as FollowReplyNotificationRow[];
  const unread_count = rows.filter((r) => !r.read_at).length;

  return NextResponse.json({
    notifications: rows,
    unread_count,
  });
}

export async function PATCH(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await businessOsForbiddenIfNeeded(supabase, user.id);
  if (denied) return denied;

  let body: { id?: string; markAll?: boolean };
  try {
    body = (await req.json()) as { id?: string; markAll?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (body.markAll) {
    const { error } = await supabase
      .from("follow_reply_events")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null)
      .is("undone_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!body.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id or markAll required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("follow_reply_events")
    .update({ read_at: now })
    .eq("user_id", user.id)
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
