import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const PatchSchema = z.object({
  status: z.enum(["open", "resolved", "dismissed"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const updates: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.status !== "open") updates.resolved_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("sam_task_clarifications")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("sam_task_clarifications") && msg.includes("schema cache")) {
      return NextResponse.json({ clarification: null });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ clarification: data });
}

