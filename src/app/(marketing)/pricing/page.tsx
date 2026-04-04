import type { Metadata } from "next";

import { PricingTierCards } from "@/components/marketing/PricingTierCards";
import { freeTrialMetaSnippet, freeTrialPhrase } from "@/lib/marketing/trial";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Solo OS, Operator OS, and Executive OS — INR pricing for Bacup. ${freeTrialMetaSnippet}.`,
};

export default function PricingPage() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-[#1a1814] dark:text-white sm:text-4xl">
            Simple pricing
          </h1>
          <p className="mt-4 text-[#5c574e] dark:text-[hsl(35_12%_70%)]">
            Three tiers. One product. {freeTrialPhrase} on each — upgrade when you need more leverage.
          </p>
        </div>
        <div className="mt-14">
          <PricingTierCards variant="page" />
        </div>
      </div>
    </section>
  );
}
