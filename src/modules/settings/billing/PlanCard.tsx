"use client";

import { Button } from "@/components/ui/button";
import type { BacupTierId, BillingInterval } from "@/lib/billing/bacupTiers";
import { CORE_PLANS, priceInr } from "@/lib/billing/bacupTiers";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export type CorePlanDef = (typeof CORE_PLANS)[number];

export function PlanCard({
  plan,
  interval,
  currentTier,
  ctaLabel,
  ctaDisabled,
  loading,
  onSelect,
}: {
  plan: CorePlanDef;
  interval: BillingInterval;
  currentTier: BacupTierId;
  ctaLabel: string;
  ctaDisabled: boolean;
  loading: boolean;
  onSelect: (id: BacupTierId) => void;
}) {
  const isCurrent = plan.id === currentTier;
  const price = priceInr(plan.monthlyInr, interval);

  return (
    <div
      className={[
        "relative flex flex-col rounded-xl border bg-white/70 p-4 shadow-sm transition-all duration-200 dark:bg-black/25",
        plan.highlighted
          ? "border-emerald-600/50 ring-2 ring-emerald-500/25 dark:border-emerald-500/40"
          : "border-[#E0DDD6]/90 hover:border-[#C8C2B8] dark:border-[hsl(35_10%_28%)] dark:hover:border-[hsl(35_12%_36%)]",
        isCurrent ? "ring-1 ring-foreground/15" : "",
      ].join(" ")}
    >
      {plan.highlighted ? (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-emerald-500">
          Most popular
        </div>
      ) : null}
      <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{plan.name}</div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{plan.tagline}</p>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums text-foreground">{inr.format(price)}</span>
        <span className="text-xs text-muted-foreground">/{interval === "yearly" ? "yr" : "mo"}</span>
      </div>
      <ul className="mt-4 flex-1 space-y-2 text-[11px] leading-snug text-muted-foreground">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-600/70 dark:bg-emerald-400/80" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        className={[
          "mt-5 w-full",
          plan.highlighted ? "" : "border border-border bg-white/80 dark:bg-black/30",
        ].join(" ")}
        variant={plan.highlighted ? "primary" : "ghost"}
        disabled={ctaDisabled || loading}
        onClick={() => onSelect(plan.id)}
      >
        {loading ? "Please wait…" : ctaLabel}
      </Button>
    </div>
  );
}
