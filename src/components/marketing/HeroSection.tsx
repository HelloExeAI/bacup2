import Link from "next/link";

import { absoluteSignUpUrl, getAppOrigin } from "@/lib/marketing/urls";
import { MarketingContainer, Reveal } from "@/components/marketing/primitives";

function NebulaBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Base wash — deep space / smoke */}
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 120% 80% at 50% -10%, rgba(96, 165, 250, 0.14), transparent 52%), radial-gradient(ellipse 70% 60% at 85% 35%, rgba(255, 255, 255, 0.07), transparent 48%), radial-gradient(ellipse 55% 50% at 12% 65%, rgba(56, 189, 248, 0.1), transparent 45%), radial-gradient(ellipse 90% 70% at 50% 110%, rgba(15, 23, 42, 0.95), transparent 55%)",
        }}
      />
      {/* Soft wispy bands */}
      <div
        className="absolute -left-1/4 top-[8%] h-[55vh] w-[90vw] rotate-[-8deg] blur-3xl"
        style={{ background: "linear-gradient(105deg, rgba(255,255,255,0.12), transparent 55%)" }}
      />
      <div
        className="absolute -right-1/3 top-[28%] h-[45vh] w-[70vw] rotate-[12deg] blur-3xl"
        style={{ background: "linear-gradient(285deg, rgba(147, 197, 253, 0.18), transparent 60%)" }}
      />
      <div
        className="absolute bottom-[-20%] left-[15%] h-[50vh] w-[80vw] blur-3xl"
        style={{ background: "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.06), transparent 65%)" }}
      />
      {/* Subtle vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 75% 65% at 50% 45%, transparent 30%, rgba(3, 5, 12, 0.75) 100%)",
        }}
      />
    </div>
  );
}

function ScrollDownCue() {
  return (
    <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3 text-white/45">
      <span className="text-[10px] font-medium uppercase tracking-[0.35em]">Scroll down</span>
      <div className="flex h-9 w-5 items-start justify-center rounded-full border border-white/25 pt-1.5">
        <div className="h-1.5 w-0.5 animate-pulse rounded-full bg-white/50" />
      </div>
    </div>
  );
}

export function HeroSection() {
  const appOrigin = getAppOrigin();
  const signUp = absoluteSignUpUrl();
  const useExternal = Boolean(appOrigin);

  return (
    <section
      id="marketing-hero"
      className="marketing-nebula-hero relative -mt-14 min-h-[100dvh] overflow-hidden border-b border-white/[0.06] pt-14 sm:-mt-16 sm:pt-16"
    >
      <NebulaBackdrop />

      <div className="relative z-10 flex min-h-[100dvh] flex-col">
        <div className="flex flex-1 flex-col justify-center px-4 pb-28 pt-10 sm:px-6 sm:pb-32 sm:pt-14">
          <MarketingContainer className="flex flex-col items-center text-center">
            <Reveal>
              <h1 className="max-w-4xl">
                <span className="block text-[clamp(1.75rem,5vw,3.75rem)] font-semibold leading-[1.12] tracking-tight text-white">
                  Bacup is that clarity:
                </span>
                <span className="mt-3 block text-[clamp(1.65rem,4.6vw,3.5rem)] font-light leading-[1.15] tracking-tight text-white/88">
                  one operating system for everything you run.
                </span>
              </h1>
            </Reveal>

            <Reveal className="mt-8 max-w-xl">
              <p className="text-base leading-relaxed text-white/55 sm:text-lg">
                Your AI Executive Assistant — organize meetings, automate follow-ups, and decide from one calm surface.
              </p>
            </Reveal>

            <Reveal className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              {useExternal ? (
                <a
                  href={signUp}
                  className="inline-flex h-12 min-w-[11rem] items-center justify-center bg-white px-8 text-sm font-semibold tracking-wide text-neutral-950 transition-[opacity,transform] hover:opacity-90 active:scale-[0.99]"
                >
                  Get started
                </a>
              ) : (
                <Link
                  href="/signup"
                  className="inline-flex h-12 min-w-[11rem] items-center justify-center bg-white px-8 text-sm font-semibold tracking-wide text-neutral-950 transition-[opacity,transform] hover:opacity-90 active:scale-[0.99]"
                >
                  Get started
                </Link>
              )}

              {useExternal ? (
                <a
                  href={`${appOrigin}/signin`}
                  className="inline-flex h-12 min-w-[11rem] items-center justify-center border border-white/35 bg-transparent px-8 text-sm font-semibold tracking-wide text-white/90 transition-[background-color,border-color] hover:border-white/55 hover:bg-white/5"
                >
                  Sign in
                </a>
              ) : (
                <Link
                  href="/signin"
                  className="inline-flex h-12 min-w-[11rem] items-center justify-center border border-white/35 bg-transparent px-8 text-sm font-semibold tracking-wide text-white/90 transition-[background-color,border-color] hover:border-white/55 hover:bg-white/5"
                >
                  Sign in
                </Link>
              )}
            </Reveal>
          </MarketingContainer>
        </div>

        <ScrollDownCue />
      </div>
    </section>
  );
}
