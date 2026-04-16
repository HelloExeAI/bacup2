"use client";

import * as React from "react";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...props }: DivProps) {
  return (
    <div
      className={[
        "rounded-2xl border border-border/70 bg-background/80 shadow-sm",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }: DivProps) {
  return (
    <div
      className={["px-6 pt-6", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export function CardContent({ className = "", ...props }: DivProps) {
  return (
    <div
      className={["px-6 pb-6 pt-4", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

