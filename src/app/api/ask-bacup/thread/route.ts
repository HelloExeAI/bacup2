import { NextResponse } from "next/server";

import { requireAskBacupAccess } from "@/lib/ask-bacup/entitlement";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Create an empty thread for a fresh chat (messages persist in DB per thread). */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const gate = await requireAskBacupAccess(supabase);
  if ("response" in gate) return gate.response;

  const { data: row, error } = await supabase
    .from("ask_bacup_threads")
    .insert({ user_id: gate.userId, title: "New chat" })
    .select("id")
    .single();

  if (error || !row?.id) {
    console.error("[ask-bacup/thread] insert", error);
    return NextResponse.json({ error: error?.message || "Failed to create thread" }, { status: 500 });
  }

  return NextResponse.json(
    { threadId: row.id as string },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
