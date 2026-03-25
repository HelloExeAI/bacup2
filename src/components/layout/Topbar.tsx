"use client";

import * as React from "react";
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
      <div className="flex h-full items-center justify-end gap-3 px-4">
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
    </header>
  );
}

