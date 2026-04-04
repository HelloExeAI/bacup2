import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    date: url.searchParams.get("date") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  let q = supabase
    .from("sam_task_clarifications")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(20);
  if (parsed.data.date) q = q.eq("source_date", parsed.data.date);

  const { data, error } = await q;
  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("sam_task_clarifications") && msg.includes("schema cache")) {
      // Backward compatibility while migration is not applied.
      return NextResponse.json({ clarifications: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ clarifications: data ?? [] });
}

