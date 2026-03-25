"use client";

import * as React from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="mx-auto flex max-w-6xl">
        <Sidebar />
        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}

