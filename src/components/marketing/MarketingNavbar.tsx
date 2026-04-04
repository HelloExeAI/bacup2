"use client";

import Link from "next/link";
import * as React from "react";

import { absoluteSignInUrl, absoluteSignUpUrl, getAppOrigin } from "@/lib/marketing/urls";

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
          ? "border-[#e8e4dc] bg-[#faf9f7]/90 shadow-sm backdrop-blur-md dark:border-[hsl(35_10%_22%)] dark:bg-[hsl(28_12%_10%)]/90"
          : "border-transparent bg-[#faf9f7]/80 backdrop-blur-sm dark:bg-[hsl(28_12%_10%)]/80",
      ].join(" ")}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
        <Link
          href="/"
          className="text-[15px] font-semibold tracking-tight text-[#1a1814] dark:text-[hsl(40_20%_96%)]"
        >
          Bacup
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-[#5c574e] transition-colors hover:text-[#1a1814] dark:text-[hsl(35_12%_72%)] dark:hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          {useExternal ? (
            <a
              href={signIn}
              className="rounded-full px-3 py-2 text-sm font-medium text-[#5c574e] transition-colors hover:text-[#1a1814] dark:text-[hsl(35_12%_72%)] dark:hover:text-white"
            >
              Sign in
            </a>
          ) : (
            <Link
              href="/signin"
              className="rounded-full px-3 py-2 text-sm font-medium text-[#5c574e] transition-colors hover:text-[#1a1814] dark:text-[hsl(35_12%_72%)] dark:hover:text-white"
            >
              Sign in
            </Link>
          )}
          {useExternal ? (
            <a
              href={signUp}
              className="rounded-full bg-[#1a1814] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 dark:bg-white dark:text-[#1a1814]"
            >
              Get started
            </a>
          ) : (
            <Link
              href="/signup"
              className="rounded-full bg-[#1a1814] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 dark:bg-white dark:text-[#1a1814]"
            >
              Get started
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
