import { NextResponse } from "next/server";
import { z } from "zod";

import { ensurePendingInstanceAfterDelete } from "@/lib/recurrence/materialize";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  status: z.enum(["active", "paused"]).optional(),
  reminder_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reminder_setup_status: z.enum(["pending", "complete", "skipped"]).optional(),
  reminder_enabled: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof PatchSchema>;
  try {
    body = PatchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updates" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() };
  if (body.reminder_setup_status === "complete" && body.reminder_time) {
    updates.reminder_enabled = true;
  }

  const { data, error } = await supabase
    .from("task_recurrence_series")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.status === "paused") {
    await supabase
      .from("tasks")
      .delete()
      .eq("series_id", id)
      .eq("user_id", user.id)
      .eq("status", "pending");
  }

  if (body.status === "active") {
    await ensurePendingInstanceAfterDelete(supabase, user.id, id);
  }

  if (body.reminder_time && body.reminder_setup_status === "complete") {
    await supabase
      .from("tasks")
      .update({ due_time: body.reminder_time.slice(0, 5) })
      .eq("series_id", id)
      .eq("user_id", user.id)
      .eq("status", "pending");
  }

  return NextResponse.json({ series: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("task_recurrence_series")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
