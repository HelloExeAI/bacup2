"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { BacupTierId } from "@/lib/billing/bacupTiers";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function AddOnsSection({
  tier,
  askBacupAddon,
  addonLoading,
  onToggleAskBacup,
}: {
  tier: BacupTierId;
  askBacupAddon: boolean;
  addonLoading: boolean;
  onToggleAskBacup: (next: boolean) => void | Promise<void>;
}) {
  const executive = tier === "executive_os";

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Add-ons</div>

      <div className="grid gap-3 sm:grid-cols-1">
        <div className="rounded-lg border border-[#E0DDD6] bg-white/60 p-3 dark:border-[hsl(35_10%_28%)] dark:bg-black/20">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-foreground">Ask Bacup (standalone)</div>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                Conversational AI on Solo or Operator. Executive includes this by default.
              </p>
              <div className="mt-2 text-xs font-medium text-foreground">{inr.format(1299)}/mo</div>
            </div>
            {executive ? (
              <span className="rounded-md border border-emerald-600/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-800 dark:text-emerald-300">
                Included
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant={askBacupAddon ? "primary" : "ghost"}
                className={askBacupAddon ? "" : "border border-border"}
                disabled={addonLoading}
                onClick={() => void onToggleAskBacup(!askBacupAddon)}
              >
                {addonLoading ? "Saving…" : askBacupAddon ? "Disable" : "Enable"}
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-[#E0DDD6] bg-white/40 p-3 dark:border-[hsl(35_10%_28%)] dark:bg-black/15">
          <div className="text-sm font-semibold text-foreground">Voice+</div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Extra live transcription minutes — usage-based packs. Checkout integration coming next; balances roll over when
            purchased.
          </p>
        </div>

        <div className="rounded-lg border border-dashed border-[#E0DDD6] bg-white/40 p-3 dark:border-[hsl(35_10%_28%)] dark:bg-black/15">
          <div className="text-sm font-semibold text-foreground">AI token packs</div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Top up when you hit monthly limits. High-margin add-on for power users — purchasable packs soon.
          </p>
        </div>
      </div>
    </div>
  );
}
