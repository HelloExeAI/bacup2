import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const PostSchema = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(["birthday", "anniversary", "other"]),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  notes: z.string().max(2000).nullable().optional(),
});

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_milestones")
    .select("id,title,kind,month,day,notes,created_at")
    .eq("user_id", user.id)
    .order("month", { ascending: true })
    .order("day", { ascending: true });

  if (error) {
    console.error("[milestones GET]", error);
    return NextResponse.json({ error: "Failed to load milestones" }, { status: 500 });
  }

  return NextResponse.json({ milestones: data ?? [] });
}

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
  const parsed = PostSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("user_milestones")
    .insert({
      user_id: user.id,
      title: parsed.data.title.trim(),
      kind: parsed.data.kind,
      month: parsed.data.month,
      day: parsed.data.day,
      notes: parsed.data.notes ?? null,
    })
    .select("id,title,kind,month,day,notes,created_at")
    .single();

  if (error) {
    console.error("[milestones POST]", error);
    return NextResponse.json({ error: "Failed to save milestone" }, { status: 500 });
  }

  return NextResponse.json({ milestone: data });
}
