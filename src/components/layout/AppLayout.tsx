"use client";

import * as React from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { RightPanel } from "@/components/layout/RightPanel";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted text-foreground">
      <Topbar />
      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="min-w-0 flex-1 p-6">
            <div className="mx-auto w-full max-w-4xl">{children}</div>
          </main>
        </div>

        <RightPanel />
      </div>
    </div>
  );
}

