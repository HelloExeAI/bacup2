import { NextResponse } from "next/server";

import { coerceBacupTierId } from "@/lib/billing/bacupTiers";
import { fetchAiQuotaSnapshot } from "@/lib/billing/aiQuota";
import { supabaseFromBearer } from "@/lib/supabase/bearerFromRequest";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = supabaseFromBearer(req);
  if (!supabase) {
    return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data: row, error: rowErr } = await supabase
      .from("user_settings")
      .select(
        "subscription_tier, billing_interval, subscription_status, current_period_end, ask_bacup_addon, billing_plan",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (rowErr) throw rowErr;

    const snapshot = await fetchAiQuotaSnapshot(supabase, user.id);
    const plan = coerceBacupTierId(row?.subscription_tier);

    const { data: profile } = await supabase.from("profiles").select("created_at").eq("id", user.id).maybeSingle();
    const subscriptionStartedAtIso =
      (typeof profile?.created_at === "string" && profile.created_at.trim()) ||
      (typeof user.created_at === "string" && user.created_at.trim()) ||
      null;

    return NextResponse.json(
      {
        plan,
        billingPlan: typeof row?.billing_plan === "string" && row.billing_plan.trim() ? row.billing_plan.trim() : "solo",
        status: row?.subscription_status ?? "active",
        nextBillingDate: row?.current_period_end ?? null,
        billingInterval: row?.billing_interval === "yearly" ? "yearly" : "monthly",
        askBacupAddon: Boolean(row?.ask_bacup_addon),
        subscriptionStartedAtIso,
        usage: {
          aiTokens: snapshot.openaiTokensUsedPeriod,
          aiTokensLimit: snapshot.openaiMonthlyLimit,
          voiceMinutes: Math.round(snapshot.deepgramSecondsUsedPeriod / 60),
          voiceMinutesLimit: Math.round(snapshot.deepgramMonthlyLimitSeconds / 60),
          openaiAddonBalance: snapshot.openaiAddonBalance,
          voiceAddonMinutes: Math.round(snapshot.deepgramAddonBalanceSeconds / 60),
        },
        periodKey: snapshot.periodKey,
        resetsAtIso: snapshot.resetsAtIso,
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (e) {
    console.error("[mobile/billing/current-plan]", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Failed to load billing", ...(process.env.NODE_ENV === "development" ? { details: message } : {}) },
      { status: 500 },
    );
  }
}
