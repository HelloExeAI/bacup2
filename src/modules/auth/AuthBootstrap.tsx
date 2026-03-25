"use client";

import * as React from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchMyProfile } from "@/lib/supabase/queries";
import { useUserStore } from "@/store/userStore";

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const setUser = useUserStore((s) => s.setUser);
  const setProfile = useUserStore((s) => s.setProfile);
  const clear = useUserStore((s) => s.clear);

  React.useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    async function hydrate() {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (cancelled) return;
      if (error) {
        clear();
        return;
      }

      const user = session?.user ?? null;
      setUser(user);

      if (!user) {
        setProfile(null);
        return;
      }

      try {
        const profile = await fetchMyProfile(supabase);
        if (!cancelled) setProfile(profile);
      } catch {
        if (!cancelled) setProfile(null);
      }
    }

    hydrate();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s) => {
      const user = s?.user ?? null;
      setUser(user);

      if (!user) {
        setProfile(null);
        return;
      }

      try {
        const profile = await fetchMyProfile(supabase);
        setProfile(profile);
      } catch {
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [clear, setProfile, setUser]);

  return <>{children}</>;
}

