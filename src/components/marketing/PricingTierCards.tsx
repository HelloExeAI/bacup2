import Link from "next/link";

import { CORE_PLANS } from "@/lib/billing/bacupTiers";
import { freeTrialCtaLanding, freeTrialCtaPricing } from "@/lib/marketing/trial";
import { absoluteSignUpUrl, getAppOrigin } from "@/lib/marketing/urls";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

type Props = {
  variant?: "landing" | "page";
};

export function PricingTierCards({ variant = "page" }: Props) {
  const signUp = absoluteSignUpUrl();
  const useExternal = Boolean(getAppOrigin());
  const ctaLabel = variant === "landing" ? freeTrialCtaLanding : freeTrialCtaPricing;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {CORE_PLANS.map((plan) => (
        <div
          key={plan.id}
          className={[
            "flex flex-col rounded-2xl border p-8 shadow-sm transition-shadow",
            plan.highlighted
              ? "border-[#1a1814] bg-white ring-1 ring-[#1a1814]/10 dark:border-white dark:bg-[hsl(28_14%_12%)] dark:ring-white/10"
              : "border-[#e8e4dc] bg-white/80 dark:border-[hsl(35_10%_22%)] dark:bg-[hsl(28_14%_10%)]",
          ].join(" ")}
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold text-[#1a1814] dark:text-white">{plan.name}</h3>
            {plan.highlighted ? (
              <span className="rounded-full bg-[#1a1814] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-white dark:text-[#1a1814]">
                Popular
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[#5c574e] dark:text-[hsl(35_12%_70%)]">{plan.tagline}</p>
          <div className="mt-6 flex items-baseline gap-1">
            <span className="text-3xl font-semibold tracking-tight text-[#1a1814] dark:text-white">
              {inr.format(plan.monthlyInr)}
            </span>
            <span className="text-sm text-[#8a8478] dark:text-[hsl(35_10%_52%)]">/mo</span>
          </div>
          <ul className="mt-8 flex-1 space-y-3 text-sm text-[#5c574e] dark:text-[hsl(35_12%_72%)]">
            {plan.features.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#1a1814]/40 dark:bg-white/50" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            {useExternal ? (
              <a
                href={signUp}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#1a1814] text-sm font-semibold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-[#1a1814]"
              >
                {ctaLabel}
              </a>
            ) : (
              <Link
                href="/signup"
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#1a1814] text-sm font-semibold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-[#1a1814]"
              >
                {ctaLabel}
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
