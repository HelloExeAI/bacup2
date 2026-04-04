import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { canUseAskBacup, coerceBacupTierId } from "@/lib/billing/bacupTiers";

export type AskBacupAuthOk = { userId: string; supabase: SupabaseClient };

/**
 * Ensures the session user may use Ask Bacup (Executive or add-on).
 * Returns a JSON Response when blocked or unauthenticated.
 */
export async function requireAskBacupAccess(
  supabase: SupabaseClient,
): Promise<AskBacupAuthOk | { response: NextResponse }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: askEnt, error: askEntErr } = await supabase
    .from("user_settings")
    .select("subscription_tier, ask_bacup_addon")
    .eq("user_id", user.id)
    .maybeSingle();

  if (askEntErr) {
    console.error("[ask-bacup] entitlement", askEntErr);
    return { response: NextResponse.json({ error: "Failed to verify plan" }, { status: 500 }) };
  }

  const tier = coerceBacupTierId(askEnt?.subscription_tier);
  if (!canUseAskBacup(tier, Boolean(askEnt?.ask_bacup_addon))) {
    return {
      response: NextResponse.json(
        { error: "Ask Bacup requires Executive OS or the Ask Bacup add-on.", code: "ask_bacup_locked" },
        { status: 403 },
      ),
    };
  }

  return { userId: user.id, supabase };
}
