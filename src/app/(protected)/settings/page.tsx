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
  const { openSettings } = useSettingsModal();

  React.useEffect(() => {
    openSettings();
    router.replace("/scratchpad");
  }, [openSettings, router]);

  return (
    <div className="p-4 text-sm text-muted-foreground">
      Opening settings…
    </div>
  );
}
