"use client";

import * as React from "react";

import type { BacupTierId } from "@/lib/billing/bacupTiers";
import { coerceBacupTierId } from "@/lib/billing/bacupTiers";
import { canUseBusinessOs } from "@/lib/billing/businessOsAccess";

type State = {
  tier: BacupTierId;
  ready: boolean;
};

/**
 * Client-side subscription tier for gating UI (Business OS vs My View).
 */
export function useSubscriptionTier(): State & { canUseBusinessOs: boolean } {
  const [state, setState] = React.useState<State>({ tier: "solo_os", ready: false });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/current-plan", { credentials: "include" });
        const j = (await res.json().catch(() => null)) as { plan?: unknown } | null;
        const tier = res.ok ? coerceBacupTierId(j?.plan) : coerceBacupTierId(null);
        if (!cancelled) setState({ tier, ready: true });
      } catch {
        if (!cancelled) setState({ tier: "solo_os", ready: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    ...state,
    canUseBusinessOs: state.ready && canUseBusinessOs(state.tier),
  };
}
