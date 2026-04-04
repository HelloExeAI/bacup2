import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const YmdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const parsed = YmdSchema.safeParse(date);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("blocks")
    .select("id,user_id,content,parent_id,date,order_index,created_at")
    .eq("date", parsed.data)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ blocks: data ?? [] });
}

const UpsertBodySchema = z.object({
  blocks: z.array(
    z.object({
      id: z.string().uuid(),
      content: z.string(),
      parent_id: z.string().uuid().nullable(),
      date: YmdSchema.nullable(),
      order_index: z.number().int().min(0),
    }),
  ),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsedBody = UpsertBodySchema.safeParse(json);
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

  const payload = parsedBody.data.blocks.map((b) => ({
    id: b.id,
    user_id: user.id,
    content: b.content,
    parent_id: b.parent_id,
    date: b.date,
    order_index: b.order_index,
  }));

  // Keep Supabase in sync with the editor state:
  // remove rows for the same date that are no longer present in this save payload.
  const byDate = new Map<string, Set<string>>();
  for (const row of payload) {
    if (!row.date) continue;
    const set = byDate.get(row.date) ?? new Set<string>();
    set.add(row.id);
    byDate.set(row.date, set);
  }

  for (const [date, keepIds] of byDate.entries()) {
    const { data: existing, error: existingErr } = await supabase
      .from("blocks")
      .select("id")
      .eq("date", date);

    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }

    const deleteIds = (existing ?? [])
      .map((r) => r.id as string)
      .filter((id) => !keepIds.has(id));

    if (deleteIds.length > 0) {
      const { error: deleteErr } = await supabase
        .from("blocks")
        .delete()
        .in("id", deleteIds);
      if (deleteErr) {
        return NextResponse.json({ error: deleteErr.message }, { status: 500 });
      }
    }
  }

  const { data, error } = await supabase
    .from("blocks")
    .upsert(payload, { onConflict: "id" })
    .select("id,user_id,content,parent_id,date,order_index,created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ blocks: data ?? [] });
}

