import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseTasks } from "@/modules/scratchpad/parser";

const BodySchema = z.object({
  transcript: z.string().min(1).max(200_000),
  create_children: z.boolean().optional().default(false),
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

  const transcript = parsedBody.data.transcript.trim();
  const drafts = parseTasks(transcript);

  const { data: note, error: noteErr } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      content: transcript,
      type: "voice",
      parent_id: null,
      parsed: drafts.length > 0,
    })
    .select("id")
    .single();

  if (noteErr) {
    return NextResponse.json({ error: noteErr.message }, { status: 500 });
  }

  if (parsedBody.data.create_children) {
    const lines = transcript
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 200);
    if (lines.length > 0) {
      await supabase.from("notes").insert(
        lines.map((content) => ({
          user_id: user.id,
          content,
          type: "voice",
          parent_id: note.id,
          parsed: false,
        })),
      );
    }
  }

  if (drafts.length === 0) {
    return NextResponse.json({ note_id: note.id, tasks: [] });
  }

  const { data: tasks, error: taskErr } = await supabase
    .from("tasks")
    .insert(
      drafts.map((t) => ({
        user_id: user.id,
        title: t.title,
        description: t.description,
        due_date: t.due_date,
        due_time: t.due_time,
        type: t.type,
        assigned_to: t.assigned_to,
        status: "pending",
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

