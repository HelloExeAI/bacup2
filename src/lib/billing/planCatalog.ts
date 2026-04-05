/**
 * Canonical plan IDs and monthly included quotas.
 * MUST stay in sync with `_ai_plan_openai_limit` / `_ai_plan_deepgram_seconds_limit` in
 * supabase/migrations (see `solo` tier in bacup_subscription_tier migration).
 */
export type BillingPlanId = "solo" | "free" | "starter" | "pro" | "business";

export type PlanQuotas = {
  /** Max OpenAI (prompt + completion) tokens per calendar month before add-on */
  monthlyOpenaiTokens: number;
  /** Max live Deepgram audio seconds per calendar month before add-on */
  monthlyDeepgramSeconds: number;
  label: string;
};

const PLANS: Record<BillingPlanId, PlanQuotas> = {
  solo: {
    label: "Solo",
    monthlyOpenaiTokens: 0,
    monthlyDeepgramSeconds: 20 * 60,
  },
  free: {
    label: "Free",
    monthlyOpenaiTokens: 80_000,
    monthlyDeepgramSeconds: 20 * 60,
  },
  starter: {
    label: "Starter",
    monthlyOpenaiTokens: 600_000,
    monthlyDeepgramSeconds: 5 * 3600,
  },
  pro: {
    label: "Pro",
    monthlyOpenaiTokens: 2_500_000,
    monthlyDeepgramSeconds: 20 * 3600,
  },
  business: {
    label: "Business",
    monthlyOpenaiTokens: 12_000_000,
    monthlyDeepgramSeconds: 80 * 3600,
  },
};

/** Purchasable add-on SKUs (balances roll over until consumed). */
export const AI_ADDON_CATALOG = {
  openai_tokens_s: { openaiTokens: 250_000, label: "AI Token Pack S", description: "+250k tokens (rolls over)" },
  openai_tokens_l: { openaiTokens: 1_500_000, label: "AI Token Pack L", description: "+1.5M tokens (rolls over)" },
  voice_minutes_300: { deepgramSeconds: 300 * 60, label: "Voice +300 min", description: "+300 minutes live transcription (rolls over)" },
  voice_hours_10: { deepgramSeconds: 10 * 3600, label: "Voice +10 hr", description: "+10 hours live transcription (rolls over)" },
  founder_boost: {
    openaiTokens: 1_000_000,
    deepgramSeconds: 5 * 3600,
    label: "Founder boost",
    description: "+1M tokens & +5 hr voice (rolls over)",
  },
} as const;

export function normalizePlanId(raw: string | null | undefined): BillingPlanId {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "solo") return "solo";
  if (s === "starter" || s === "pro" || s === "business") return s;
  /** Legacy rows may still say `free` (pre–Solo OS migration). */
  if (s === "free") return "free";
  /** Empty or unknown → treat as Solo (0 included OpenAI), not legacy free (80k). */
  return "solo";
}

export function planQuotas(plan: BillingPlanId): PlanQuotas {
  return PLANS[plan];
}

export function planOpenAITokensLimit(plan: BillingPlanId): number {
  return PLANS[plan].monthlyOpenaiTokens;
}

export function planDeepgramSecondsLimit(plan: BillingPlanId): number {
  return PLANS[plan].monthlyDeepgramSeconds;
}

export function allPlansForDisplay(): Array<{ id: BillingPlanId } & PlanQuotas> {
  return (Object.keys(PLANS) as BillingPlanId[]).map((id) => ({ id, ...PLANS[id] }));
}
