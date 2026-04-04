"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { syncPosthogPerson } from "@/lib/posthog-person";
import { useEventStore } from "@/store/eventStore";
import { useTaskStore } from "@/store/taskStore";
import { useUserStore } from "@/store/userStore";

/**
 * Server clears httpOnly Supabase cookies; client clears in-memory session and local stores.
 */
export async function performAppSignOut(router: { push: (href: string) => void; refresh: () => void }): Promise<void> {
  try {
    const res = await fetch("/auth/sign-out", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[sign-out] server returned", res.status);
    }
  } catch (e) {
    console.warn("[sign-out] request failed", e);
  }

  try {
    await createSupabaseBrowserClient().auth.signOut({ scope: "local" });
  } catch {
    /* ignore */
  }

  useUserStore.getState().clear();
  useTaskStore.getState().clear();
  useEventStore.getState().clear();
  syncPosthogPerson(null, null);

  router.push("/signin");
  router.refresh();
}
