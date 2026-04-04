import type { BillingPlanId } from "@/lib/billing/planCatalog";

export type BacupTierId = "solo_os" | "operator_os" | "executive_os";

export type BillingInterval = "monthly" | "yearly";

export const BACUP_TIER_ORDER: Record<BacupTierId, number> = {
  solo_os: 0,
  operator_os: 1,
  executive_os: 2,
};

/** Monthly INR (display). Yearly uses ~2 months free: monthly × 10. */
export const CORE_PLANS: Array<{
  id: BacupTierId;
  name: string;
  tagline: string;
  monthlyInr: number;
  features: string[];
  highlighted?: boolean;
}> = [
  {
    id: "solo_os",
    name: "Solo OS",
    tagline: "Structured personal OS — structure without AI cost.",
    monthlyInr: 799,
    features: [
      "Scratchpad & daily thinking layer",
      "Tasks — recurrence, milestones, priorities",
      "Google & Outlook calendar",
      "Gmail read/send",
      "Voice capture — basic transcription",
      "No included AI automation (keeps cost low)",
    ],
  },
  {
    id: "operator_os",
    name: "Operator OS",
    tagline: "Execution AI — turn manual work into automated workflows.",
    monthlyInr: 1799,
    highlighted: true,
    features: [
      "Everything in Solo OS",
      "AI task extraction from notes",
      "Task rewriting & structuring",
      "Daily AI brief & Gmail redrafting",
      "In-app intelligent suggestions (SAM)",
    ],
  },
  {
    id: "executive_os",
    name: "Executive OS",
    tagline: "Intelligence layer — decisions, context, and leverage.",
    monthlyInr: 3499,
    features: [
      "Everything in Operator OS",
      "Ask Bacup — context-aware assistant",
      "Cross-workspace reasoning",
      "Decision support & focus guidance",
      "Web intelligence integrations",
      "Highest included AI & voice limits",
    ],
  },
];

export function priceInr(monthly: number, interval: BillingInterval): number {
  return interval === "yearly" ? monthly * 10 : monthly;
}

export function coerceBacupTierId(raw: unknown): BacupTierId {
  if (raw === "operator_os" || raw === "executive_os") return raw;
  return "solo_os";
}

/**
 * Maps product tier → `billing_plan` for quota RPCs (must match SQL `_ai_plan_*`).
 */
export function tierToBillingPlan(tier: BacupTierId): BillingPlanId {
  if (tier === "operator_os") return "starter";
  if (tier === "executive_os") return "pro";
  return "solo";
}

export function compareTier(a: BacupTierId, b: BacupTierId): number {
  return BACUP_TIER_ORDER[a] - BACUP_TIER_ORDER[b];
}

export function computeNextPeriodEnd(interval: BillingInterval, from = new Date()): string {
  const d = new Date(from.getTime());
  if (interval === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
}

export function canUseAskBacup(tier: BacupTierId, askBacupAddon: boolean): boolean {
  return tier === "executive_os" || askBacupAddon;
}
