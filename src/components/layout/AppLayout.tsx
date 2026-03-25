"use client";

import * as React from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { RightPanel } from "@/components/layout/RightPanel";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted text-foreground">
      <div className="mx-auto flex min-h-screen w-full">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="min-w-0 flex-1 p-6">
            <div className="mx-auto w-full max-w-4xl">{children}</div>
          </main>
        </div>

        <RightPanel />
      </div>
    </div>
  );
}

