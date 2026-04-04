import { NextResponse } from "next/server";

import { requireAskBacupAccess } from "@/lib/ask-bacup/entitlement";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** List Ask Bacup conversation threads (newest first) for history picker. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const gate = await requireAskBacupAccess(supabase);
  if ("response" in gate) return gate.response;

  const { data: threads, error } = await supabase
    .from("ask_bacup_threads")
    .select("id,title,created_at,updated_at")
    .eq("user_id", gate.userId)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error) {
    console.error("[ask-bacup/threads]", error);
    return NextResponse.json({ error: "Failed to list threads" }, { status: 500 });
  }

  return NextResponse.json(
    { threads: threads ?? [] },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
