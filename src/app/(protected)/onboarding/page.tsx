import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Onboarding",
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome to Bacup</h1>
      <p className="mt-3 text-muted-foreground">
        You&apos;re in. Start from your scratchpad or open the dashboard — everything syncs as you go.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/scratchpad"
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground"
        >
          Open scratchpad
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
