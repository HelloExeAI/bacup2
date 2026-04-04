import { NextResponse } from "next/server";
import { z } from "zod";

import {
  type BacupTierId,
  type BillingInterval,
  computeNextPeriodEnd,
  tierToBillingPlan,
} from "@/lib/billing/bacupTiers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    planId: z.enum(["solo_os", "operator_os", "executive_os"]),
    billingInterval: z.enum(["monthly", "yearly"]).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const planId = parsed.data.planId as BacupTierId;

  const { data: existing, error: readErr } = await supabase
    .from("user_settings")
    .select("billing_interval, ask_bacup_addon")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readErr) {
    console.error("[billing/activate-plan] read", readErr);
    return NextResponse.json({ error: "Failed to read settings" }, { status: 500 });
  }

  const interval: BillingInterval =
    parsed.data.billingInterval ??
    (existing?.billing_interval === "yearly" ? "yearly" : "monthly");

  const billing_plan = tierToBillingPlan(planId);
  const nextEnd = computeNextPeriodEnd(interval);
  const ask_bacup_addon = planId === "executive_os" ? false : Boolean(existing?.ask_bacup_addon);

  const { error: upErr } = await supabase
    .from("user_settings")
    .update({
      subscription_tier: planId,
      billing_plan,
      billing_interval: interval,
      subscription_status: "active",
      current_period_end: nextEnd,
      ask_bacup_addon,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (upErr) {
    console.error("[billing/activate-plan] update", upErr);
    const msg = upErr.message || "";
    if (msg.includes("subscription_tier") || msg.includes("column")) {
      return NextResponse.json(
        { error: "Database migration required: apply latest Supabase migrations for subscription columns." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Failed to activate plan" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    plan: planId,
    billingPlan: billing_plan,
    billingInterval: interval,
    nextBillingDate: nextEnd,
  });
}
