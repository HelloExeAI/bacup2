import Link from "next/link";

import { FeaturesSection } from "@/components/marketing/FeaturesSection";
import { HeroSection } from "@/components/marketing/HeroSection";
import { PricingTierCards } from "@/components/marketing/PricingTierCards";
import { MarketingContainer, MarketingH2, MarketingKicker, MarketingSection, Reveal } from "@/components/marketing/primitives";
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
      <MarketingSection tone="muted">
        <MarketingContainer>
          <div className="mx-auto max-w-2xl text-center">
            <Reveal>
              <MarketingKicker>Pricing</MarketingKicker>
            </Reveal>
            <Reveal className="mt-3">
              <MarketingH2>Solo, Operator, and Executive — pick your operating system.</MarketingH2>
            </Reveal>
            <Reveal className="mt-3">
              <p className="text-sm text-muted-foreground">
                {freeTrialPhrase} on every plan.{" "}
                <Link href="/pricing" className="font-medium underline-offset-4 hover:underline">
                  Compare plans in detail
                </Link>
              </p>
            </Reveal>
          </div>
          <div className="mt-14">
            <PricingTierCards variant="landing" />
          </div>
          <div className="mt-12 text-center">
            {useExternal ? (
              <a
                href={signUp}
                className="inline-flex h-12 items-center justify-center rounded-full bg-foreground px-10 text-sm font-semibold text-background shadow-md transition-opacity hover:opacity-90"
              >
                {freeTrialCtaLanding}
              </a>
            ) : (
              <Link
                href="/signup"
                className="inline-flex h-12 items-center justify-center rounded-full bg-foreground px-10 text-sm font-semibold text-background shadow-md transition-opacity hover:opacity-90"
              >
                {freeTrialCtaLanding}
              </Link>
            )}
          </div>
        </MarketingContainer>
      </MarketingSection>
    </>
  );
}
