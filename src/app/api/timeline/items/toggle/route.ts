import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { defaultDueTimeQuarterHour } from "@/lib/datetime/quarterHour";

const ToggleSchema = z.object({
  itemKey: z.string().min(1),
  title: z.string().min(1).max(200),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_time: z.string().regex(/^\d{2}:\d{2}$/),
  /** Desired final status after toggle. */
  target_status: z.enum(["pending", "done"]),
});

function timelineItemDescriptionKey(itemKey: string) {
  return `timeline_item_key:${itemKey}`;
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
  const parsed = ToggleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { itemKey, title, due_date, due_time, target_status } = parsed.data;

  const actor = await (async () => {
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
    return actorName;
  })();

  const descKey = timelineItemDescriptionKey(itemKey);

  const { data: existing, error: exErr } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .eq("description", descKey)
    .maybeSingle();

  if (exErr) {
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }

  if (existing) {
    const updates: Record<string, unknown> = {
      status: target_status,
    };

    if (target_status === "done") {
      updates.completed_at = new Date().toISOString();
      updates.completed_by_name = actor;
    } else {
      updates.completed_at = null;
      updates.completed_by_name = null;
    }

    const { data: updated, error: upErr } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", existing.id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ task: updated });
  }

  // First time the user marks completion for this external timeline item.
  const dueTimeSafe = due_time?.trim() || defaultDueTimeQuarterHour();

  const { data: inserted, error: insErr } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      title,
      description: descKey,
      due_date,
      due_time: dueTimeSafe,
      type: "todo",
      assigned_to: "self",
      status: target_status,
      completed_at: target_status === "done" ? new Date().toISOString() : null,
      completed_by_name: target_status === "done" ? actor : null,
      source: "manual",
    })
    .select("*")
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ task: inserted });
}

