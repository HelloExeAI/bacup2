"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { absoluteSignInUrl, absoluteSignUpUrl, getAppOrigin } from "@/lib/marketing/urls";
import { MarketingContainer } from "@/components/marketing/primitives";

const HOME_NAV = [
  { id: "marketing-hero", href: "/#marketing-hero", label: "Introduction" },
  { id: "technology", href: "/#technology", label: "The technology" },
  { id: "layers", href: "/#layers", label: "Tech spotlight" },
  { id: "features", href: "/#features", label: "Why Bacup?" },
] as const;

function FeedLogo({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/icon.png"
      alt=""
      aria-hidden
      width={22}
      height={22}
      className={["rounded-sm", className].join(" ")}
    />
  );
}

export function MarketingNavbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState<string>("marketing-hero");

  const signIn = absoluteSignInUrl();
  const signUp = absoluteSignUpUrl();
  const useExternal = Boolean(getAppOrigin());
  const isHome = pathname === "/";

  React.useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      if (isHome && window.scrollY < 96) setActiveSection("marketing-hero");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  React.useEffect(() => {
    if (!isHome) return;
    const ids = HOME_NAV.map((n) => n.id);
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.target.id) setActiveSection(e.target.id);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.12, 0.25] },
    );
    for (const el of elements) obs.observe(el);
    return () => obs.disconnect();
  }, [isHome]);

  const overlayOnDarkHero = isHome && !scrolled;

  const headerClass = [
    "sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300",
    overlayOnDarkHero
      ? "border-b border-transparent bg-transparent"
      : "border-b border-border/70 bg-background/85 shadow-sm backdrop-blur-md",
  ].join(" ");

  const navLinkClass = (sectionId: string) => {
    const active = isHome && activeSection === sectionId;
    const base = "text-[11px] font-medium uppercase tracking-[0.18em] transition-colors";
    if (overlayOnDarkHero) {
      return [
        base,
        active ? "text-white underline decoration-white/80 underline-offset-8" : "text-white/55 hover:text-white/90",
      ].join(" ");
    }
    return [
      base,
      active ? "text-foreground underline decoration-foreground/70 underline-offset-8" : "text-muted-foreground hover:text-foreground",
    ].join(" ");
  };

  const logoClass = overlayOnDarkHero ? "text-white" : "text-foreground";
  const burgerClass = overlayOnDarkHero ? "text-white" : "text-foreground";

  return (
    <header className={[headerClass, "fixed inset-x-0 top-0"].join(" ")}>
      <MarketingContainer className="relative grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-3 sm:h-16">
        <Link href="/" className={["flex items-center gap-2.5 justify-self-start", logoClass].join(" ")} title="Bacup home">
          <FeedLogo className="shrink-0" />
          <span className="sr-only">Bacup</span>
        </Link>

        {isHome ? (
          <nav className="hidden justify-center justify-self-center md:flex md:items-center md:gap-10 lg:gap-12">
            {HOME_NAV.map((item) => (
              <Link key={item.id} href={item.href} className={navLinkClass(item.id)}>
                {item.label}
              </Link>
            ))}
          </nav>
        ) : (
          <nav className="hidden justify-center justify-self-center md:flex md:items-center md:gap-8">
            <Link
              href="/#technology"
              className={[
                "text-[11px] font-medium uppercase tracking-[0.18em]",
                overlayOnDarkHero ? "text-white/55 hover:text-white/90" : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              Product
            </Link>
            <Link
              href="/pricing"
              className={[
                "text-[11px] font-medium uppercase tracking-[0.18em]",
                overlayOnDarkHero ? "text-white/55 hover:text-white/90" : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              Pricing
            </Link>
          </nav>
        )}

        <div className="flex items-center justify-end gap-2 justify-self-end sm:gap-3">
          {useExternal ? (
            <a
              href={signIn}
              className={[
                "hidden rounded-full px-3 py-2 text-sm font-medium transition-colors sm:inline-flex",
                overlayOnDarkHero ? "text-white/75 hover:text-white" : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              Sign in
            </a>
          ) : (
            <Link
              href="/signin"
              className={[
                "hidden rounded-full px-3 py-2 text-sm font-medium transition-colors sm:inline-flex",
                overlayOnDarkHero ? "text-white/75 hover:text-white" : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              Sign in
            </Link>
          )}
          {useExternal ? (
            <a
              href={signUp}
              className={[
                "hidden h-9 items-center justify-center px-4 text-sm font-semibold transition-[opacity,transform] hover:opacity-90 sm:inline-flex",
                overlayOnDarkHero
                  ? "bg-white text-neutral-950"
                  : "rounded-full bg-foreground text-background shadow-sm",
              ].join(" ")}
            >
              Get started
            </a>
          ) : (
            <Link
              href="/signup"
              className={[
                "hidden h-9 items-center justify-center px-4 text-sm font-semibold transition-[opacity,transform] hover:opacity-90 sm:inline-flex",
                overlayOnDarkHero
                  ? "bg-white text-neutral-950"
                  : "rounded-full bg-foreground text-background shadow-sm",
              ].join(" ")}
            >
              Get started
            </Link>
          )}

          <button
            type="button"
            className={["inline-flex h-10 w-10 items-center justify-center md:hidden", burgerClass].join(" ")}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </MarketingContainer>

      {mobileOpen ? (
        <div
          className={[
            "border-t md:hidden",
            overlayOnDarkHero ? "border-white/10 bg-[#03050c]/95 backdrop-blur-md" : "border-border/70 bg-background/95 backdrop-blur-md",
          ].join(" ")}
        >
          <MarketingContainer className="flex flex-col gap-1 py-4">
            {(isHome
              ? HOME_NAV
              : [
                  { href: "/#technology", label: "Product" },
                  { href: "/pricing", label: "Pricing" },
                ]
            ).map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={[
                  "px-2 py-3 text-[11px] font-medium uppercase tracking-[0.2em]",
                  overlayOnDarkHero ? "text-white/80" : "text-foreground",
                ].join(" ")}
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div
              className={[
                "mt-2 flex flex-col gap-2 border-t pt-4",
                overlayOnDarkHero ? "border-white/10" : "border-border/60",
              ].join(" ")}
            >
              {useExternal ? (
                <a href={signIn} className="px-2 py-2 text-sm font-medium" onClick={() => setMobileOpen(false)}>
                  Sign in
                </a>
              ) : (
                <Link href="/signin" className="px-2 py-2 text-sm font-medium" onClick={() => setMobileOpen(false)}>
                  Sign in
                </Link>
              )}
              {useExternal ? (
                <a
                  href={signUp}
                  className="mx-2 inline-flex h-11 items-center justify-center bg-foreground text-sm font-semibold text-background"
                  onClick={() => setMobileOpen(false)}
                >
                  Get started
                </a>
              ) : (
                <Link
                  href="/signup"
                  className="mx-2 inline-flex h-11 items-center justify-center bg-foreground text-sm font-semibold text-background"
                  onClick={() => setMobileOpen(false)}
                >
                  Get started
                </Link>
              )}
            </div>
          </MarketingContainer>
        </div>
      ) : null}
    </header>
  );
}
