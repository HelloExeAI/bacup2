import Link from "next/link";

import { absoluteSignUpUrl, getAppOrigin } from "@/lib/marketing/urls";

export function HeroSection() {
  const appOrigin = getAppOrigin();
  const signUp = absoluteSignUpUrl();
  const useExternal = Boolean(appOrigin);

  return (
    <section className="relative overflow-hidden border-b border-[#e8e4dc] dark:border-[hsl(35_10%_22%)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-20"
        style={{
          background:
            "radial-gradient(900px 500px at 20% -10%, rgba(120, 100, 80, 0.12), transparent 60%), radial-gradient(700px 400px at 90% 0%, rgba(80, 90, 120, 0.1), transparent 55%)",
        }}
      />
      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 md:py-32">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#8a8478] dark:text-[hsl(35_10%_52%)]">
          AI Executive Assistant OS
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl md:text-[3.25rem] md:leading-[1.08]">
          Run your life like a company.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#5c574e] dark:text-[hsl(35_12%_72%)]">
          Bacup is your AI Executive Assistant — organize, automate, and decide from one place.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          {useExternal ? (
            <a
              href={signUp}
              className="inline-flex h-12 items-center justify-center rounded-full bg-[#1a1814] px-8 text-sm font-semibold text-white shadow-md shadow-black/10 transition-opacity hover:opacity-90 dark:bg-white dark:text-[#1a1814]"
            >
              Get started
            </a>
          ) : (
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center rounded-full bg-[#1a1814] px-8 text-sm font-semibold text-white shadow-md shadow-black/10 transition-opacity hover:opacity-90 dark:bg-white dark:text-[#1a1814]"
            >
              Get started
            </Link>
          )}
          {useExternal ? (
            <a
              href={`${appOrigin}/signin`}
              className="inline-flex h-12 items-center justify-center rounded-full border border-[#d4cfc4] bg-white/60 px-8 text-sm font-semibold text-[#1a1814] backdrop-blur-sm transition-colors hover:bg-white dark:border-[hsl(35_10%_26%)] dark:bg-[hsl(28_14%_14%)] dark:text-white dark:hover:bg-[hsl(28_14%_18%)]"
            >
              Sign in
            </a>
          ) : (
            <Link
              href="/signin"
              className="inline-flex h-12 items-center justify-center rounded-full border border-[#d4cfc4] bg-white/60 px-8 text-sm font-semibold text-[#1a1814] backdrop-blur-sm transition-colors hover:bg-white dark:border-[hsl(35_10%_26%)] dark:bg-[hsl(28_14%_14%)] dark:text-white dark:hover:bg-[hsl(28_14%_18%)]"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
