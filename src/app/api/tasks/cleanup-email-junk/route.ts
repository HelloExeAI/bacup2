import { NextResponse } from "next/server";
import { z } from "zod";

import { isJunkEmailSourcedTaskRow } from "@/lib/email/emailJunkHeuristics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  confirm: z.literal(true),
});

/**
 * Deletes pending tasks where source is email and heuristics match known junk patterns
 * (job alerts, banking promos, webinars, etc.).
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Send { \"confirm\": true }" }, { status: 400 });
  }
  if (!body.confirm) {
    return NextResponse.json({ error: "confirm required" }, { status: 400 });
  }

  const { data: rows, error } = await supabase
    .from("tasks")
    .select("id,title,description,source")
    .eq("user_id", user.id)
    .eq("source", "email")
    .eq("status", "pending");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const junkIds = (rows ?? [])
    .filter((r) => isJunkEmailSourcedTaskRow(rowToCheck(r)))
    .map((r) => r.id as string);

  if (junkIds.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  const { error: delErr } = await supabase.from("tasks").delete().in("id", junkIds);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: junkIds.length });
}

function rowToCheck(r: {
  id: unknown;
  title: unknown;
  description: unknown;
  source: unknown;
}): Parameters<typeof isJunkEmailSourcedTaskRow>[0] {
  return {
    title: typeof r.title === "string" ? r.title : "",
    description: typeof r.description === "string" ? r.description : null,
    source: typeof r.source === "string" ? r.source : null,
  };
}
