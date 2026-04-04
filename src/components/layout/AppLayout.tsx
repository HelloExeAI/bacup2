"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { RightPanel } from "@/components/layout/RightPanel";
import { useRecurrenceReconcile } from "@/hooks/useRecurrenceReconcile";
import { AskBacupDock } from "@/components/ask-bacup/AskBacupDock";
import { SettingsProvider } from "@/modules/settings/SettingsProvider";
import { useUserStore } from "@/store/userStore";

function RecurrenceReconcileRunner() {
  const user = useUserStore((s) => s.user);
  useRecurrenceReconcile(Boolean(user));
  return null;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  return (
    <SettingsProvider>
      <RecurrenceReconcileRunner />
      <AskBacupDock />
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <Topbar />
        <div className="mx-auto flex min-h-0 w-full flex-1">
          {!isDashboard ? <Sidebar /> : null}

          <div className="flex min-w-0 flex-1 flex-col border-r border-border/45">
            <main className={isDashboard ? "flex min-h-0 w-full min-w-0 flex-1 flex-col p-0" : "min-w-0 flex-1 p-4"}>
              {isDashboard ? (
                <div className="flex h-full min-h-0 w-full flex-1 flex-col p-3 md:p-4">{children}</div>
              ) : (
                <div className="mx-auto w-full max-w-[min(1400px,calc(100vw-24px))] rounded-xl bacup-surface p-3 md:p-4">
                  {children}
                </div>
              )}
            </main>
          </div>

          {!isDashboard ? <RightPanel /> : null}
        </div>
      </div>
    </SettingsProvider>
  );
}

