import Link from "next/link";

import { absoluteSignUpUrl, getAppOrigin } from "@/lib/marketing/urls";
import {
  MarketingContainer,
  MarketingH1,
  MarketingKicker,
  MarketingLead,
  MarketingPrimaryButton,
  MarketingSecondaryLink,
  Reveal,
} from "@/components/marketing/primitives";

export function HeroSection() {
  const appOrigin = getAppOrigin();
  const signUp = absoluteSignUpUrl();
  const useExternal = Boolean(appOrigin);

  return (
    <section className="relative overflow-hidden border-b border-border/70">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-40 left-[-20%] h-[520px] w-[720px] rounded-full blur-3xl opacity-60"
          style={{ background: "radial-gradient(circle at 30% 30%, hsl(var(--ring) / 0.25), transparent 60%)" }}
        />
        <div
          className="absolute -top-44 right-[-10%] h-[520px] w-[720px] rounded-full blur-3xl opacity-50"
          style={{ background: "radial-gradient(circle at 60% 20%, hsl(var(--foreground) / 0.12), transparent 55%)" }}
        />
      </div>

      <MarketingContainer className="relative py-20 sm:py-28 md:py-32">
        <Reveal>
          <MarketingKicker>AI Executive Assistant OS</MarketingKicker>
        </Reveal>
        <Reveal className="mt-4">
          <div className="max-w-3xl">
            <MarketingH1>Run your life like a company.</MarketingH1>
          </div>
        </Reveal>
        <Reveal className="mt-6">
          <div className="max-w-xl">
            <MarketingLead>
              Bacup is your AI Executive Assistant — organize, automate, and decide from one place.
            </MarketingLead>
          </div>
        </Reveal>

        <Reveal className="mt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {useExternal ? (
              <a href={signUp}>
                <MarketingPrimaryButton>Get started</MarketingPrimaryButton>
              </a>
            ) : (
              <Link href="/signup">
                <MarketingPrimaryButton>Get started</MarketingPrimaryButton>
              </Link>
            )}

            {useExternal ? (
              <MarketingSecondaryLink href={`${appOrigin}/signin`}>Sign in</MarketingSecondaryLink>
            ) : (
              <Link href="/signin" className="inline-flex">
                <MarketingSecondaryLink href="/signin" onClick={(e) => e.preventDefault()}>
                  Sign in
                </MarketingSecondaryLink>
              </Link>
            )}
          </div>
        </Reveal>

        <Reveal className="mt-10">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Live meetings", value: "Record + transcript" },
              { label: "Automate followups", value: "Status links + inbox" },
              { label: "Scratchpad", value: "Daily OS" },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</div>
                <div className="mt-1 text-sm font-medium text-foreground">{k.value}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </MarketingContainer>
    </section>
  );
}
