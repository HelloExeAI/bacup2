import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ensurePendingInstanceAfterDelete,
  materializeNextAfterComplete,
} from "@/lib/recurrence/materialize";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  due_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  assigned_to: z.string().trim().min(1).max(120).optional(),
  type: z.enum(["todo", "followup", "reminder"]).optional(),
  status: z.enum(["pending", "done"]).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates = { ...parsed.data } as Record<string, unknown>;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  if (updates.status === "done") {
    updates.completed_at = new Date().toISOString();
  } else if (updates.status === "pending") {
    updates.completed_at = null;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("display_name, name")
    .eq("id", user.id)
    .maybeSingle();

  const actorName =
    [prof?.display_name, prof?.name]
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .find((s) => s.length > 0) ||
    (typeof user.email === "string" ? user.email.split("@")[0] : "") ||
    "User";

  const bodyKeys = Object.keys(parsed.data) as (keyof typeof parsed.data)[];
  const hasContentEdit = bodyKeys.some((k) =>
    ["title", "description", "due_date", "due_time", "assigned_to", "type"].includes(k as string),
  );

  if (parsed.data.status === "done") {
    updates.completed_by_name = actorName;
  }
  if (parsed.data.status === "pending") {
    updates.completed_by_name = null;
  }
  if (hasContentEdit) {
    updates.last_edited_by_name = actorName;
  }

  const { data: existing } = await supabase
    .from("tasks")
    .select("id,series_id,status,source,due_date")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    parsed.data.status === "pending" &&
    existing.series_id &&
    existing.status === "done"
  ) {
    return NextResponse.json(
      { error: "Cannot reopen a completed recurring instance. Create a one-off task if needed." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (data?.status === "done" && data.series_id && typeof data.due_date === "string") {
    await materializeNextAfterComplete(supabase, user.id, {
      series_id: data.series_id,
      due_date: data.due_date,
    });
  }

  return NextResponse.json({ task: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: row } = await supabase
    .from("tasks")
    .select("series_id,status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const seriesId = row?.series_id ? String(row.series_id) : null;
  const wasPending = row?.status === "pending";

  const { error } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (seriesId && wasPending) {
    await ensurePendingInstanceAfterDelete(supabase, user.id, seriesId);
  }

  return NextResponse.json({ ok: true });
}

