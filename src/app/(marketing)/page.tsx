import Link from "next/link";

import { FeaturesSection } from "@/components/marketing/FeaturesSection";
import { HeroSection } from "@/components/marketing/HeroSection";
import { PricingTierCards } from "@/components/marketing/PricingTierCards";
import { freeTrialCtaLanding, freeTrialMetaSnippet, freeTrialPhrase } from "@/lib/marketing/trial";
import { absoluteSignUpUrl, getAppOrigin } from "@/lib/marketing/urls";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Run your life like a company",
  description: `Bacup is your AI Executive Assistant — organize, automate, and decide from one place. ${freeTrialMetaSnippet}.`,
};

export default function LandingPage() {
  const appOrigin = getAppOrigin();
  const signUp = absoluteSignUpUrl();
  const useExternal = Boolean(appOrigin);

  return (
    <>
      <HeroSection />
      <FeaturesSection />
      <section className="border-t border-[#e8e4dc] bg-[#f3f1ec] py-20 dark:border-[hsl(35_10%_22%)] dark:bg-[hsl(28_14%_8%)] sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#8a8478] dark:text-[hsl(35_10%_52%)]">
              Pricing
            </h2>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-[#1a1814] dark:text-white sm:text-3xl">
              Solo, Operator, and Executive — pick your operating system.
            </p>
            <p className="mt-3 text-sm text-[#5c574e] dark:text-[hsl(35_12%_70%)]">
              {freeTrialPhrase} on every plan.{" "}
              <Link href="/pricing" className="font-medium underline-offset-4 hover:underline">
                Compare plans in detail
              </Link>
            </p>
          </div>
          <div className="mt-14">
            <PricingTierCards variant="landing" />
          </div>
          <div className="mt-12 text-center">
            {useExternal ? (
              <a
                href={signUp}
                className="inline-flex h-12 items-center justify-center rounded-full bg-[#1a1814] px-10 text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-90 dark:bg-white dark:text-[#1a1814]"
              >
                {freeTrialCtaLanding}
              </a>
            ) : (
              <Link
                href="/signup"
                className="inline-flex h-12 items-center justify-center rounded-full bg-[#1a1814] px-10 text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-90 dark:bg-white dark:text-[#1a1814]"
              >
                {freeTrialCtaLanding}
              </Link>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
