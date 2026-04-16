"use client";

import * as React from "react";

export function MarketingContainer({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={["mx-auto w-full max-w-6xl px-4 sm:px-6", className].filter(Boolean).join(" ")}>{children}</div>;
}

export function MarketingSection({
  children,
  className = "",
  tone = "default",
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "muted";
} & React.HTMLAttributes<HTMLElement>) {
  const base =
    tone === "muted"
      ? "border-t border-border/60 bg-muted/30"
      : "border-t border-border/0";
  return (
    <section {...props} className={[base, "py-20 sm:py-24", className].filter(Boolean).join(" ")}>
      {children}
    </section>
  );
}

export function MarketingKicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
      {children}
    </div>
  );
}

export function MarketingH1({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-[3.25rem] md:leading-[1.08]">
      {children}
    </h1>
  );
}

export function MarketingH2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
      {children}
    </h2>
  );
}

export function MarketingLead({ children }: { children: React.ReactNode }) {
  return <p className="text-lg leading-relaxed text-muted-foreground">{children}</p>;
}

export function MarketingCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-2xl border border-border/60 bg-background/70 shadow-sm",
        "backdrop-blur-[2px]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

export function MarketingPrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return (
    <button
      {...props}
      className={[
        "inline-flex h-12 items-center justify-center rounded-full px-8 text-sm font-semibold",
        "bg-foreground text-background shadow-md shadow-black/10",
        "transition-[transform,opacity] hover:opacity-90 active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
}

export function MarketingSecondaryLink({
  children,
  className = "",
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { className?: string }) {
  return (
    <a
      {...props}
      className={[
        "inline-flex h-12 items-center justify-center rounded-full px-8 text-sm font-semibold",
        "border border-border bg-background/60 text-foreground backdrop-blur-sm",
        "transition-[transform,background-color] hover:bg-background active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </a>
  );
}

export function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShow(true);
            obs.disconnect();
            break;
          }
        }
      },
      { rootMargin: "80px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={[
        "transition-[transform,opacity] duration-500 ease-out will-change-transform",
        show ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

