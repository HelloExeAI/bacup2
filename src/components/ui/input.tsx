"use client";

import * as React from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = "", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={[
        "h-10 w-full rounded-full border border-border bg-background/70 px-4 text-sm text-foreground",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        "disabled:opacity-50 disabled:pointer-events-none",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
});

