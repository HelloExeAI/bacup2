import { redirect } from "next/navigation";

import { canUseBusinessOs } from "@/lib/billing/businessOsAccess";
import { coerceBacupTierId } from "@/lib/billing/bacupTiers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Post-auth landing: Executive OS → Business OS (`/workspace`), other tiers → My View (`/my-view`).
 */
export default async function StartPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data } = await supabase
    .from("user_settings")
    .select("subscription_tier")
    .eq("user_id", user.id)
    .maybeSingle();

  const tier = coerceBacupTierId(data?.subscription_tier);
  redirect(canUseBusinessOs(tier) ? "/workspace" : "/my-view");
}
