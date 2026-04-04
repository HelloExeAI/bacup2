"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { BacupTierId } from "@/lib/billing/bacupTiers";
import { CORE_PLANS } from "@/lib/billing/bacupTiers";
import type { SubscriptionStatus } from "@/modules/settings/types";

function formatUtcCalendarDay(d: Date): string {
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function statusLabel(s: SubscriptionStatus): string {
  switch (s) {
    case "trial":
      return "Trial";
    case "expired":
      return "Expired";
    case "canceled":
      return "Canceled";
    default:
      return "Active";
  }
}

function pct(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, (used / limit) * 100);
}

export function CurrentPlanCard({
  tier,
  status,
  nextBillingDate,
  billingInterval,
  usage,
  subscriptionStartedAtIso,
  periodKey,
  resetsAtIso,
  cancelLoading,
  onUpgradeClick,
  onCancelClick,
}: {
  tier: BacupTierId;
  status: SubscriptionStatus;
  nextBillingDate: string | null;
  billingInterval: "monthly" | "yearly";
  usage: {
    aiTokens: number;
    aiTokensLimit: number;
    voiceMinutes: number;
    voiceMinutesLimit: number;
    openaiAddonBalance: number;
    voiceAddonMinutes: number;
  };
  subscriptionStartedAtIso: string | null;
  periodKey: string;
  resetsAtIso: string;
  cancelLoading: boolean;
  onUpgradeClick: () => void;
  onCancelClick: () => void | Promise<void>;
}) {
  const meta = CORE_PLANS.find((p) => p.id === tier);

  return (
    <div className="rounded-xl border border-[#E0DDD6] bg-gradient-to-b from-white/90 to-white/60 p-4 dark:border-[hsl(35_10%_28%)] dark:from-black/30 dark:to-black/15">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Current plan</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{meta?.name ?? tier}</div>
          <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{meta?.tagline}</p>
        </div>
        <span className="rounded-full border border-border bg-white/80 px-2.5 py-1 text-[11px] font-medium dark:bg-black/30">
          {statusLabel(status)}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <span className="font-medium text-foreground">Billing</span> · {billingInterval === "yearly" ? "Yearly" : "Monthly"}
        </div>
        <div>
          <span className="font-medium text-foreground">Next renewal</span> ·{" "}
          {nextBillingDate
            ? formatUtcCalendarDay(new Date(nextBillingDate))
            : "— (activate a plan to set)"}
        </div>
      </div>

      {subscriptionStartedAtIso ? (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Account since {formatUtcCalendarDay(new Date(subscriptionStartedAtIso))} (UTC)
        </p>
      ) : null}

      <div className="mt-4 space-y-3 rounded-lg border border-[#E0DDD6]/80 bg-white/50 p-3 dark:border-[hsl(35_10%_26%)] dark:bg-black/20">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Usage this period</div>
        <div>
          <div className="flex justify-between gap-2 text-xs font-medium text-foreground">
            <span>AI tokens</span>
            <span className="tabular-nums text-muted-foreground">
              {usage.aiTokens.toLocaleString()} /{" "}
              {usage.aiTokensLimit <= 0 ? "0 (not included)" : usage.aiTokensLimit.toLocaleString()}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-600/85 dark:bg-emerald-500/80"
              style={{ width: `${pct(usage.aiTokens, Math.max(1, usage.aiTokensLimit))}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            UTC {periodKey} · Resets {formatUtcCalendarDay(new Date(resetsAtIso))} · Rollover tokens:{" "}
            {usage.openaiAddonBalance.toLocaleString()}
          </p>
        </div>
        <div>
          <div className="flex justify-between gap-2 text-xs font-medium text-foreground">
            <span>Voice</span>
            <span className="tabular-nums text-muted-foreground">
              {usage.voiceMinutes} / {usage.voiceMinutesLimit} min
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-sky-600/85 dark:bg-sky-500/80"
              style={{ width: `${pct(usage.voiceMinutes, Math.max(1, usage.voiceMinutesLimit))}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Rollover voice add-on: {usage.voiceAddonMinutes} min
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onUpgradeClick}>
          Upgrade plan
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="border border-border"
          disabled={cancelLoading || tier === "solo_os"}
          onClick={() => void onCancelClick()}
        >
          {cancelLoading ? "Updating…" : "Cancel plan"}
        </Button>
      </div>
      {tier === "solo_os" ? (
        <p className="mt-2 text-[10px] text-muted-foreground">You are already on the entry plan (Solo OS).</p>
      ) : null}
    </div>
  );
}
