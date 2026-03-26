"use client";

import * as React from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function Topbar() {
  const [time, setTime] = React.useState<string>("—");

  React.useEffect(() => {
    const format = () =>
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setTime(format());
    const id = window.setInterval(() => setTime(format()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="h-14 border-b border-border bg-background">
      <div className="flex h-full items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold">
            Bc
          </div>
          <div className="text-sm font-semibold">Bacup</div>
        </Link>

        <div className="flex items-center justify-end gap-3">
          <div className="hidden text-sm text-muted-foreground md:block">
            {time}
          </div>
          <ThemeToggle />
          <div
            className="h-8 w-8 rounded-full border border-border bg-muted"
            aria-label="User avatar"
            role="img"
          />
        </div>
      </div>
    </header>
  );
}

