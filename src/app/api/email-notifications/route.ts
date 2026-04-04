import { NextResponse } from "next/server";

import { calendarYmdInTimeZone } from "@/lib/email/calendarYmd";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type EmailNotificationRow = {
  id: string;
  summary: string;
  subject: string | null;
  connected_account_id: string;
  thread_id: string | null;
  message_id: string;
  read_at: string | null;
  created_at: string;
  bucket_date: string;
};

/** Today's email summaries (bucket_date = calendar today in profile timezone). */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  const tz = typeof profile?.timezone === "string" ? profile.timezone : "UTC";
  const bucket = calendarYmdInTimeZone(tz);

  const { data, error } = await supabase
    .from("user_email_notifications")
    .select(
      "id,summary,subject,connected_account_id,thread_id,message_id,read_at,created_at,bucket_date",
    )
    .eq("user_id", user.id)
    .eq("bucket_date", bucket)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    bucket_date: bucket,
    notifications: (data ?? []) as EmailNotificationRow[],
  });
}

/** Mark one or all of today's email notifications as read (bell opened). */
export async function PATCH(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: string; markAll?: boolean };
  try {
    body = (await req.json()) as { id?: string; markAll?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  const tz = typeof profile?.timezone === "string" ? profile.timezone : "UTC";
  const bucket = calendarYmdInTimeZone(tz);
  const now = new Date().toISOString();

  if (body.markAll) {
    const { error } = await supabase
      .from("user_email_notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .eq("bucket_date", bucket)
      .is("read_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!body.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id or markAll required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_email_notifications")
    .update({ read_at: now })
    .eq("user_id", user.id)
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
