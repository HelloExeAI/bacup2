import type { Metadata } from "next";

import { PricingTierCards } from "@/components/marketing/PricingTierCards";
import { MarketingContainer, MarketingH1 } from "@/components/marketing/primitives";
import { freeTrialMetaSnippet, freeTrialPhrase } from "@/lib/marketing/trial";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Solo OS, Operator OS, and Executive OS — INR pricing for Bacup. ${freeTrialMetaSnippet}.`,
};

export default function PricingPage() {
  return (
    <section className="py-16 sm:py-20">
      <MarketingContainer>
        <div className="mx-auto max-w-2xl text-center">
          <MarketingH1>Simple pricing</MarketingH1>
          <p className="mt-4 text-muted-foreground">
            Three tiers. One product. {freeTrialPhrase} on each — upgrade when you need more leverage.
          </p>
        </div>
        <div className="mt-14">
          <PricingTierCards variant="page" />
        </div>
      </MarketingContainer>
    </section>
  );
}
