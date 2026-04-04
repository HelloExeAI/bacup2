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
        "h-10 w-full rounded-md border border-foreground/10 bg-background px-3 text-sm text-foreground",
        "placeholder:text-foreground/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        "disabled:opacity-50 disabled:pointer-events-none",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
});

