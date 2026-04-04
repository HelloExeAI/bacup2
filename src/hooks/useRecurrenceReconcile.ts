"use client";

import * as React from "react";

/**
 * Periodic reconcile for the signed-in user so missing recurring instances are restored
 * (network failures, race on materialize, tab closed mid-request).
 */
export function useRecurrenceReconcile(enabled: boolean) {
  const run = React.useCallback(() => {
    void fetch("/api/recurrence/reconcile", {
      method: "POST",
      credentials: "include",
    }).catch(() => {
      /* offline */
    });
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    run();
    const id = window.setInterval(run, 4 * 60 * 60 * 1000);
    const onFocus = () => run();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, run]);
}
