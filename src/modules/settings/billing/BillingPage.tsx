"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { BacupTierId, BillingInterval } from "@/lib/billing/bacupTiers";
import { CORE_PLANS, compareTier } from "@/lib/billing/bacupTiers";
import type { SubscriptionStatus, UserSettingsRow } from "@/modules/settings/types";

import { AddOnsSection } from "./AddOnsSection";
import { CurrentPlanCard } from "./CurrentPlanCard";
import { PlanCard } from "./PlanCard";

type CurrentPlanApi = {
  plan: BacupTierId;
  status: SubscriptionStatus;
  nextBillingDate: string | null;
  billingInterval: BillingInterval;
  askBacupAddon: boolean;
  subscriptionStartedAtIso: string | null;
  usage: {
    aiTokens: number;
    aiTokensLimit: number;
    voiceMinutes: number;
    voiceMinutesLimit: number;
    openaiAddonBalance: number;
    voiceAddonMinutes: number;
  };
  periodKey: string;
  resetsAtIso: string;
};

export function BillingPage({
  settings,
  reloadSettings,
  flashSaveNotice,
}: {
  settings: UserSettingsRow | null;
  reloadSettings: () => Promise<void>;
  flashSaveNotice: (message: string) => void;
}) {
  const [data, setData] = React.useState<CurrentPlanApi | null>(null);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [activatingId, setActivatingId] = React.useState<BacupTierId | null>(null);
  const [cancelLoading, setCancelLoading] = React.useState(false);
  const [addonLoading, setAddonLoading] = React.useState(false);
  const [interval, setInterval] = React.useState<BillingInterval>("monthly");
  const [intervalSaving, setIntervalSaving] = React.useState(false);

  React.useEffect(() => {
    if (settings?.billing_interval) setInterval(settings.billing_interval);
  }, [settings?.billing_interval]);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await fetch("/api/billing/current-plan", { cache: "no-store", credentials: "include" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Failed to load billing");
      setData(j as CurrentPlanApi);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Failed to load billing");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh, settings?.subscription_tier, settings?.billing_plan, settings?.ask_bacup_addon]);

  const currentTier = data?.plan ?? settings?.subscription_tier ?? "solo_os";
  const status = data?.status ?? settings?.subscription_status ?? "active";
  const nextBilling = data?.nextBillingDate ?? settings?.current_period_end ?? null;
  const billingInterval = data?.billingInterval ?? settings?.billing_interval ?? "monthly";
  const askAddon = data?.askBacupAddon ?? settings?.ask_bacup_addon ?? false;

  const usage: CurrentPlanApi["usage"] = data?.usage ?? {
    aiTokens: 0,
    aiTokensLimit: 0,
    voiceMinutes: 0,
    voiceMinutesLimit: 0,
    openaiAddonBalance: 0,
    voiceAddonMinutes: 0,
  };

  const scrollToPlans = () => {
    document.getElementById("bacup-plans")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const persistInterval = async (next: BillingInterval) => {
    setInterval(next);
    setIntervalSaving(true);
    try {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        cache: "no-store",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings: { billing_interval: next } }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Failed to save billing period");
      await reloadSettings();
      flashSaveNotice("Billing period updated.");
      await refresh();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Failed to save billing period");
    } finally {
      setIntervalSaving(false);
    }
  };

  const activatePlan = async (planId: BacupTierId) => {
    const cmp = compareTier(planId, currentTier);
    if (cmp < 0) {
      const ok = window.confirm(
        "Downgrade to a lower plan? Your included limits will change immediately (no payment flow yet).",
      );
      if (!ok) return;
    }
    setActivatingId(planId);
    setLoadErr(null);
    try {
      const res = await fetch("/api/billing/activate-plan", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId, billingInterval: interval }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Activation failed");
      await reloadSettings();
      await refresh();
      flashSaveNotice("Plan updated.");
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Activation failed");
    } finally {
      setActivatingId(null);
    }
  };

  const cancelPlan = async () => {
    const ok = window.confirm(
      "Cancel and return to Solo OS? Ask Bacup add-on will be turned off. Limits will update immediately.",
    );
    if (!ok) return;
    setCancelLoading(true);
    setLoadErr(null);
    try {
      const res = await fetch("/api/billing/cancel-plan", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Cancel failed");
      await reloadSettings();
      await refresh();
      flashSaveNotice("Plan reset to Solo OS.");
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setCancelLoading(false);
    }
  };

  const toggleAskAddon = async (next: boolean) => {
    setAddonLoading(true);
    setLoadErr(null);
    try {
      const res = await fetch("/api/billing/toggle-ask-addon", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Could not update add-on");
      await reloadSettings();
      await refresh();
      flashSaveNotice(next ? "Ask Bacup add-on enabled." : "Ask Bacup add-on disabled.");
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not update add-on");
    } finally {
      setAddonLoading(false);
    }
  };

  const busy = Boolean(activatingId) || cancelLoading;

  return (
    <div className="space-y-6 text-sm">
      {loadErr ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {loadErr}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Billing period</div>
        <div className="inline-flex rounded-lg border border-[#E0DDD6] bg-white/60 p-0.5 dark:border-[hsl(35_10%_28%)] dark:bg-black/25">
          <Button
            type="button"
            size="sm"
            variant={interval === "monthly" ? "primary" : "ghost"}
            className="h-8 rounded-md px-3 text-xs"
            disabled={intervalSaving || busy}
            onClick={() => void persistInterval("monthly")}
          >
            Monthly
          </Button>
          <Button
            type="button"
            size="sm"
            variant={interval === "yearly" ? "primary" : "ghost"}
            className="h-8 rounded-md px-3 text-xs"
            disabled={intervalSaving || busy}
            onClick={() => void persistInterval("yearly")}
          >
            Yearly
          </Button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Yearly pricing shows ~2 months off (10× monthly). Stripe checkout will replace instant activation later.
      </p>

      {loading && !data ? (
        <p className="text-xs text-muted-foreground">Loading billing…</p>
      ) : (
        <CurrentPlanCard
          tier={currentTier}
          status={status}
          nextBillingDate={nextBilling}
          billingInterval={billingInterval}
          usage={usage}
          subscriptionStartedAtIso={data?.subscriptionStartedAtIso ?? null}
          periodKey={data?.periodKey ?? ""}
          resetsAtIso={data?.resetsAtIso ?? new Date().toISOString()}
          cancelLoading={cancelLoading}
          onUpgradeClick={scrollToPlans}
          onCancelClick={cancelPlan}
        />
      )}

      <div id="bacup-plans" className="scroll-mt-4 space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Available plans</div>
        <div className="grid gap-3 lg:grid-cols-3">
          {CORE_PLANS.map((p) => {
            const cmp = compareTier(p.id, currentTier);
            const cta =
              cmp === 0 ? "Current plan" : cmp > 0 ? "Upgrade" : "Downgrade";
            const isCurrent = cmp === 0;
            return (
              <PlanCard
                key={p.id}
                plan={p}
                interval={interval}
                currentTier={currentTier}
                ctaLabel={cta}
                ctaDisabled={isCurrent || busy}
                loading={activatingId === p.id}
                onSelect={(id) => void activatePlan(id)}
              />
            );
          })}
        </div>
      </div>

      <AddOnsSection
        tier={currentTier}
        askBacupAddon={askAddon}
        addonLoading={addonLoading}
        onToggleAskBacup={toggleAskAddon}
      />

      <div className="rounded-lg border border-dashed border-[#E0DDD6] bg-white/35 px-3 py-3 dark:border-[hsl(35_10%_28%)] dark:bg-black/15">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Billing history</div>
        <p className="mt-2 text-xs text-muted-foreground">
          Invoices and receipts will appear here once Stripe billing is connected.
        </p>
      </div>
    </div>
  );
}
