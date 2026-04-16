"use client";

import Link from "next/link";
import * as React from "react";

import { absoluteSignInUrl, absoluteSignUpUrl, getAppOrigin } from "@/lib/marketing/urls";
import { MarketingContainer } from "@/components/marketing/primitives";

const nav = [
  { href: "/#layers", label: "Product" },
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
];

export function MarketingNavbar() {
  const [scrolled, setScrolled] = React.useState(false);
  const signIn = absoluteSignInUrl();
  const signUp = absoluteSignUpUrl();
  const useExternal = Boolean(getAppOrigin());

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={[
        "sticky top-0 z-50 border-b transition-[background,box-shadow] duration-200",
        scrolled
          ? "border-border/70 bg-background/80 shadow-sm backdrop-blur-md"
          : "border-transparent bg-background/60 backdrop-blur-sm",
      ].join(" ")}
    >
      <MarketingContainer className="flex h-14 items-center justify-between gap-4 sm:h-16">
        <Link href="/" className="text-[15px] font-semibold tracking-tight text-foreground">
          Bacup
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          {useExternal ? (
            <a
              href={signIn}
              className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </a>
          ) : (
            <Link
              href="/signin"
              className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
          )}
          {useExternal ? (
            <a
              href={signUp}
              className="inline-flex h-9 items-center justify-center rounded-full bg-foreground px-4 text-sm font-semibold text-background shadow-sm transition-opacity hover:opacity-90"
            >
              Get started
            </a>
          ) : (
            <Link
              href="/signup"
              className="inline-flex h-9 items-center justify-center rounded-full bg-foreground px-4 text-sm font-semibold text-background shadow-sm transition-opacity hover:opacity-90"
            >
              Get started
            </Link>
          )}
        </div>
      </MarketingContainer>
    </header>
  );
}
