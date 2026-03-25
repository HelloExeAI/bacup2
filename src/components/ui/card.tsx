"use client";

import * as React from "react";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...props }: DivProps) {
  return (
    <div
      className={[
        "rounded-xl border border-foreground/10 bg-background shadow-sm",
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

