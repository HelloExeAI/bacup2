"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useSettingsModal } from "@/modules/settings/SettingsProvider";

/**
 * Direct /settings visits open the settings modal and return to the main workspace
 * so settings never occupy the center content panel alone.
 */
export default function SettingsPage() {
  const router = useRouter();
  const { openSettings, openSettingsToTab } = useSettingsModal();

  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const ig = sp.get("integrations")?.trim() ?? "";
    if (ig.startsWith("microsoft_") || ig.startsWith("google_")) {
      openSettingsToTab("integrations");
    } else {
      openSettings();
    }
    router.replace("/scratchpad");
  }, [openSettings, openSettingsToTab, router]);

  return (
    <div className="p-4 text-sm text-muted-foreground">
      Opening settings…
    </div>
  );
}
