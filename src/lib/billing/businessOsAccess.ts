import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import type { BacupTierId } from "@/lib/billing/bacupTiers";
import { coerceBacupTierId } from "@/lib/billing/bacupTiers";

/** Business OS (workspace hub, org, EA policies, etc.) ships with Executive OS. */
export function canUseBusinessOs(tier: BacupTierId): boolean {
  return tier === "executive_os";
}

export async function getSubscriptionTierForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<BacupTierId> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("subscription_tier")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return coerceBacupTierId(data?.subscription_tier);
}

/** Returns a 403 JSON response if the user is not entitled to Business OS APIs. */
export async function businessOsForbiddenIfNeeded(
  supabase: SupabaseClient,
  userId: string,
): Promise<NextResponse | null> {
  const tier = await getSubscriptionTierForUser(supabase, userId);
  if (canUseBusinessOs(tier)) return null;
  return NextResponse.json(
    { error: "business_os_not_entitled", message: "Business OS is available on Executive OS." },
    { status: 403 },
  );
}
