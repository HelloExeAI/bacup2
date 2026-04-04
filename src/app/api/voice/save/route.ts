import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseTasks } from "@/modules/scratchpad/parser";
import { getPostHogClient } from "@/lib/posthog-server";

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
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "voice_note_created",
      properties: { tasks_extracted: 0, transcript_length: transcript.length },
    });
    return NextResponse.json({ note_id: note.id, tasks: [] });
  }

  const { data: tasks, error: taskErr } = await supabase
    .from("tasks")
    .insert(
      drafts.map((t) => ({
        user_id: user.id,
        title: t.title,
        description: t.description,
        due_date: t.due_date ?? new Date().toISOString().slice(0, 10),
        due_time: t.due_time ?? "09:00",
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

  const savedTasks = tasks ?? [];
  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: user.id,
    event: "voice_note_created",
    properties: {
      tasks_extracted: savedTasks.length,
      transcript_length: transcript.length,
    },
  });

  return NextResponse.json({ note_id: note.id, tasks: savedTasks });
}

