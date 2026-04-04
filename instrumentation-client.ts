import posthog from "posthog-js";

import { installBenignAbortNoiseFilter } from "@/lib/dev/benignAbortNoise";
import { syncPosthogPerson } from "@/lib/posthog-person";
import { useUserStore } from "@/store/userStore";

installBenignAbortNoiseFilter();

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (token) {
  posthog.init(token, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
    /** Ensure person profiles + `$set` are processed (wizard-safe default). */
    person_profiles: "identified_only",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
    /** Dropped fetches / navigations often surface as AbortError — not actionable product bugs. */
    before_send: (cr) => {
      if (!cr || cr.event !== "$exception") return cr;
      const blob = JSON.stringify(cr.properties ?? {});
      if (blob.includes("AbortError") || blob.includes("aborted without reason")) return null;
      return cr;
    },
    loaded: () => {
      /** Re-sync after init: first identify can run before Zustand has session/profile. */
      const replay = () => {
        try {
          const { user, profile } = useUserStore.getState();
          if (user) syncPosthogPerson(user, profile);
        } catch {
          /* ignore */
        }
      };
      replay();
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => replay());
        window.setTimeout(replay, 400);
        window.setTimeout(replay, 2500);
      }
    },
  });
}
