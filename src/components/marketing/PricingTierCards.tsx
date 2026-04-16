import Link from "next/link";

import { CORE_PLANS } from "@/lib/billing/bacupTiers";
import { freeTrialCtaLanding, freeTrialCtaPricing } from "@/lib/marketing/trial";
import { absoluteSignUpUrl, getAppOrigin } from "@/lib/marketing/urls";
import { MarketingCard, Reveal } from "@/components/marketing/primitives";

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
        <Reveal key={plan.id}>
          <MarketingCard
            className={[
              "flex flex-col p-8 transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:shadow-md",
              plan.highlighted ? "border-foreground/70 ring-1 ring-foreground/10" : "",
            ].join(" ")}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
              {plan.highlighted ? (
                <span className="rounded-full bg-foreground px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background">
                  Popular
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{plan.tagline}</p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-3xl font-semibold tracking-tight text-foreground">{inr.format(plan.monthlyInr)}</span>
              <span className="text-sm text-muted-foreground">/mo</span>
            </div>
            <ul className="mt-8 flex-1 space-y-3 text-sm text-muted-foreground">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              {useExternal ? (
                <a
                  href={signUp}
                  className="inline-flex h-11 w-full items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background transition-opacity hover:opacity-90"
                >
                  {ctaLabel}
                </a>
              ) : (
                <Link
                  href="/signup"
                  className="inline-flex h-11 w-full items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background transition-opacity hover:opacity-90"
                >
                  {ctaLabel}
                </Link>
              )}
            </div>
          </MarketingCard>
        </Reveal>
      ))}
    </div>
  );
}
