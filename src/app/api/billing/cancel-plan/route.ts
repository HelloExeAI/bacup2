import { NextResponse } from "next/server";

import { computeNextPeriodEnd, tierToBillingPlan } from "@/lib/billing/bacupTiers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Resets to Solo OS (entry tier). Payment provider hooks will refine this later. */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing } = await supabase
    .from("user_settings")
    .select("billing_interval")
    .eq("user_id", user.id)
    .maybeSingle();

  const interval = existing?.billing_interval === "yearly" ? "yearly" : "monthly";
  const billing_plan = tierToBillingPlan("solo_os");
  const nextEnd = computeNextPeriodEnd(interval);

  const { error } = await supabase
    .from("user_settings")
    .update({
      subscription_tier: "solo_os",
      billing_plan,
      subscription_status: "active",
      ask_bacup_addon: false,
      current_period_end: nextEnd,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    console.error("[billing/cancel-plan]", error);
    return NextResponse.json({ error: "Failed to cancel plan" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, plan: "solo_os", billingPlan: billing_plan });
}
