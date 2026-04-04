import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadTodayTimeline } from "@/lib/timeline/loadTodayTimeline";

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

  try {
    const result = await loadTodayTimeline(supabase, user.id);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[timeline/today]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
