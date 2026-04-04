import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { suggestNextDueTimeExcludingTaskId } from "@/lib/scheduling/assignDueTimesFromCalendar";

const BodySchema = z.object({
  excludeTaskId: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function ymdToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const dayYmd = parsed.data.day ?? ymdToday();

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", parsed.data.excludeTaskId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (taskErr || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  try {
    const due_time = await suggestNextDueTimeExcludingTaskId(supabase, user.id, dayYmd, parsed.data.excludeTaskId);
    return NextResponse.json({ due_time, day: dayYmd });
  } catch (e) {
    console.error("[scheduling/suggest-next-slot]", e);
    return NextResponse.json({ error: "Could not compute slot" }, { status: 500 });
  }
}
