import type { SupabaseClient } from "@supabase/supabase-js";

import type { BillingPlanId } from "@/lib/billing/planCatalog";
import {
  normalizePlanId,
  planDeepgramSecondsLimit,
  planOpenAITokensLimit,
} from "@/lib/billing/planCatalog";
import { nextUtcPeriodStart, utcPeriodKey } from "@/lib/billing/period";

export type AiQuotaSnapshot = {
  periodKey: string;
  plan: BillingPlanId;
  /** Included monthly limits */
  openaiMonthlyLimit: number;
  deepgramMonthlyLimitSeconds: number;
  /** Consumption this period (total; may exceed monthly limit when add-on covered overflow) */
  openaiTokensUsedPeriod: number;
  deepgramSecondsUsedPeriod: number;
  /** Rollover balances */
  openaiAddonBalance: number;
  deepgramAddonBalanceSeconds: number;
  /** Estimated remaining capacity this month (included remaining + add-on) */
  openaiRemainingApprox: number;
  deepgramRemainingApproxSeconds: number;
  resetsAtIso: string;
};

function isMissingAiUsageInfrastructure(err: { message?: string } | null | undefined) {
  const m = (err?.message ?? "").toLowerCase();
  return (
    m.includes("user_ai_usage_periods") ||
    m.includes("user_ai_addon_balance") ||
    m.includes("ai_apply_openai_token_usage") ||
    m.includes("schema cache") ||
    m.includes("does not exist")
  );
}

export async function fetchAiQuotaSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<AiQuotaSnapshot> {
  const periodKey = utcPeriodKey();
  const [settingsRes, periodRes, addonRes] = await Promise.all([
    supabase.from("user_settings").select("billing_plan").eq("user_id", userId).maybeSingle(),
    supabase
      .from("user_ai_usage_periods")
      .select("openai_tokens, deepgram_seconds")
      .eq("user_id", userId)
      .eq("period_key", periodKey)
      .maybeSingle(),
    supabase.from("user_ai_addon_balance").select("openai_tokens, deepgram_seconds").eq("user_id", userId).maybeSingle(),
  ]);

  if (isMissingAiUsageInfrastructure(periodRes.error) || isMissingAiUsageInfrastructure(addonRes.error)) {
    const plan = normalizePlanId(settingsRes.data?.billing_plan);
    const openaiMonthlyLimit = planOpenAITokensLimit(plan);
    const deepgramMonthlyLimitSeconds = planDeepgramSecondsLimit(plan);
    return {
      periodKey,
      plan,
      openaiMonthlyLimit,
      deepgramMonthlyLimitSeconds,
      openaiTokensUsedPeriod: 0,
      deepgramSecondsUsedPeriod: 0,
      openaiAddonBalance: 0,
      deepgramAddonBalanceSeconds: 0,
      openaiRemainingApprox: openaiMonthlyLimit,
      deepgramRemainingApproxSeconds: deepgramMonthlyLimitSeconds,
      resetsAtIso: nextUtcPeriodStart().toISOString(),
    };
  }

  if (periodRes.error) throw periodRes.error;
  if (addonRes.error) throw addonRes.error;

  const plan = normalizePlanId(settingsRes.data?.billing_plan);
  const openaiMonthlyLimit = planOpenAITokensLimit(plan);
  const deepgramMonthlyLimitSeconds = planDeepgramSecondsLimit(plan);

  const usedOpenai = Number(periodRes.data?.openai_tokens ?? 0) || 0;
  const usedDg = Number(periodRes.data?.deepgram_seconds ?? 0) || 0;
  const addonOpenai = Number(addonRes.data?.openai_tokens ?? 0) || 0;
  const addonDg = Number(addonRes.data?.deepgram_seconds ?? 0) || 0;

  const openaiRemainingApprox = Math.max(0, openaiMonthlyLimit - usedOpenai) + addonOpenai;
  const deepgramRemainingApproxSeconds = Math.max(0, deepgramMonthlyLimitSeconds - usedDg) + addonDg;

  return {
    periodKey,
    plan,
    openaiMonthlyLimit,
    deepgramMonthlyLimitSeconds,
    openaiTokensUsedPeriod: usedOpenai,
    deepgramSecondsUsedPeriod: usedDg,
    openaiAddonBalance: addonOpenai,
    deepgramAddonBalanceSeconds: addonDg,
    openaiRemainingApprox,
    deepgramRemainingApproxSeconds,
    resetsAtIso: nextUtcPeriodStart().toISOString(),
  };
}

export async function assertOpenAIQuotaAvailable(
  supabase: SupabaseClient,
  userId: string,
  estimatedTokens: number,
): Promise<{ ok: true; snapshot: AiQuotaSnapshot } | { ok: false; snapshot: AiQuotaSnapshot }> {
  const snapshot = await fetchAiQuotaSnapshot(supabase, userId);
  const need = Math.max(1, Math.min(estimatedTokens, 500_000));
  if (snapshot.openaiRemainingApprox < need) {
    return { ok: false, snapshot };
  }
  return { ok: true, snapshot };
}

export async function assertDeepgramQuotaAvailable(
  supabase: SupabaseClient,
  userId: string,
  estimatedSeconds = 60,
): Promise<{ ok: true; snapshot: AiQuotaSnapshot } | { ok: false; snapshot: AiQuotaSnapshot }> {
  const snapshot = await fetchAiQuotaSnapshot(supabase, userId);
  const need = Math.max(1, Math.min(estimatedSeconds, 24 * 3600));
  if (snapshot.deepgramRemainingApproxSeconds < need) {
    return { ok: false, snapshot };
  }
  return { ok: true, snapshot };
}

/**
 * Records OpenAI token usage. Uses DB RPC (auth.uid must match user).
 * Swallows insufficient quota after the fact (logs); callers should pre-check.
 */
export async function recordOpenAITokenUsage(
  supabase: SupabaseClient,
  userId: string,
  totalTokens: number,
): Promise<{ ok: boolean; error?: string }> {
  const delta = Math.max(0, Math.floor(totalTokens));
  if (delta === 0) return { ok: true };
  const { error } = await supabase.rpc("ai_apply_openai_token_usage", {
    p_user_id: userId,
    p_period_key: utcPeriodKey(),
    p_delta: delta,
  });
  if (error) {
    const msg = error.message || String(error);
    if (isMissingAiUsageInfrastructure(error)) {
      return { ok: true };
    }
    if (msg.includes("insufficient_ai_quota") || msg.includes("P0001")) {
      return { ok: false, error: "insufficient_ai_quota" };
    }
    console.error("[aiQuota] recordOpenAITokenUsage", error);
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function recordDeepgramSeconds(
  supabase: SupabaseClient,
  userId: string,
  seconds: number,
): Promise<{ ok: boolean; error?: string }> {
  const delta = Math.max(0, Math.min(Math.floor(seconds), 24 * 3600));
  if (delta === 0) return { ok: true };
  const { error } = await supabase.rpc("ai_apply_deepgram_seconds", {
    p_user_id: userId,
    p_period_key: utcPeriodKey(),
    p_delta: delta,
  });
  if (error) {
    const msg = error.message || String(error);
    if (isMissingAiUsageInfrastructure(error)) {
      return { ok: true };
    }
    if (msg.includes("insufficient_voice_quota") || msg.includes("P0001")) {
      return { ok: false, error: "insufficient_voice_quota" };
    }
    console.error("[aiQuota] recordDeepgramSeconds", error);
    return { ok: false, error: msg };
  }
  return { ok: true };
}
