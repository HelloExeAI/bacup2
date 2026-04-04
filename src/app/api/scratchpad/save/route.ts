import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { defaultDueTimeQuarterHour } from "@/lib/datetime/quarterHour";
import { parseTasks } from "@/modules/scratchpad/parser";

const BodySchema = z.object({
  content: z.string().min(1).max(50_000),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsedBody = BodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const content = parsedBody.data.content.trim();
  const taskDrafts = parseTasks(content);

  // Write as the signed-in user; RLS enforces per-user access.
  const { data: note, error: noteErr } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      content,
      type: "text",
      parent_id: null,
      parsed: taskDrafts.length > 0,
    })
    .select("id")
    .single();

  if (noteErr) {
    return NextResponse.json({ error: noteErr.message }, { status: 500 });
  }

  if (taskDrafts.length === 0) {
    return NextResponse.json({ note_id: note.id, tasks: [] });
  }

  const { data: tasks, error: taskErr } = await supabase
    .from("tasks")
    .insert(
      taskDrafts.map((t) => ({
        user_id: user.id,
        title: t.title,
        description: t.description,
        due_date: t.due_date ?? new Date().toISOString().slice(0, 10),
        due_time: t.due_time ?? defaultDueTimeQuarterHour(),
        type: t.type,
        assigned_to: t.assigned_to || "self",
        status: "pending",
        completed_at: null,
        source: "scratchpad",
      })),
    )
    .select("*");

  if (taskErr) {
    return NextResponse.json(
      { error: taskErr.message, note_id: note.id },
      { status: 500 },
    );
  }

  return NextResponse.json({ note_id: note.id, tasks: tasks ?? [] });
}

