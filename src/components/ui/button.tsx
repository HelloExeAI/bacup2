"use client";

import * as React from "react";

type Variant = "primary" | "ghost";
type Size = "sm" | "md";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const base =
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "bg-foreground text-background hover:opacity-90",
  ghost: "hover:bg-foreground/5",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

export function Button({
  className = "",
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={[base, variants[variant], sizes[size], className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

