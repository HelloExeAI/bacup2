import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Inbox AI sync is disabled: task extraction runs only after reply / forward / reply-all sends
 * via POST /api/integrations/google/gmail/process-messages with the appropriate trigger.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    ok: true,
    skipped: true,
    reason: "inbound_ai_disabled",
  });
}
