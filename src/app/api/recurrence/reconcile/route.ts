import { NextResponse } from "next/server";

import { reconcileAllActiveSeriesForUser } from "@/lib/recurrence/materialize";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Per-user safety net: ensure each active recurrence series has a pending instance.
 * Called from the client on a timer; cheap when nothing is missing.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await reconcileAllActiveSeriesForUser(supabase, user.id);
  return NextResponse.json({ ok: true, ...result });
}
