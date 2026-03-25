"use client";

import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function Topbar() {
  return (
    <header className="h-14 border-b border-border bg-background">
      <div className="flex h-full items-center justify-end gap-3 px-4">
        <ThemeToggle />
        <div
          className="h-8 w-8 rounded-full border border-border bg-muted"
          aria-label="User avatar"
          role="img"
        />
      </div>
    </header>
  );
}

