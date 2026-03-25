"use client";

import * as React from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchMyEvents, fetchMyProfile, fetchMyTasks } from "@/lib/supabase/queries";
import { useUserStore } from "@/store/userStore";
import { useTaskStore } from "@/store/taskStore";
import { useEventStore } from "@/store/eventStore";

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const setUser = useUserStore((s) => s.setUser);
  const setProfile = useUserStore((s) => s.setProfile);
  const clear = useUserStore((s) => s.clear);
  const setTasks = useTaskStore((s) => s.setTasks);
  const clearTasks = useTaskStore((s) => s.clear);
  const setEvents = useEventStore((s) => s.setEvents);
  const clearEvents = useEventStore((s) => s.clear);

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
        clearTasks();
        clearEvents();
        return;
      }

      const user = session?.user ?? null;
      setUser(user);

      if (!user) {
        setProfile(null);
        clearTasks();
        clearEvents();
        return;
      }

      try {
        const profile = await fetchMyProfile(supabase);
        if (!cancelled) setProfile(profile);
      } catch {
        if (!cancelled) setProfile(null);
      }

      try {
        const tasks = await fetchMyTasks(supabase);
        if (!cancelled) setTasks(tasks);
      } catch {
        if (!cancelled) setTasks([]);
      }

      try {
        const events = await fetchMyEvents(supabase);
        if (!cancelled) setEvents(events);
      } catch {
        if (!cancelled) setEvents([]);
      }
    }

    hydrate();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s) => {
      const user = s?.user ?? null;
      setUser(user);

      if (!user) {
        setProfile(null);
        clearTasks();
        clearEvents();
        return;
      }

      try {
        const profile = await fetchMyProfile(supabase);
        setProfile(profile);
      } catch {
        setProfile(null);
      }

      try {
        const tasks = await fetchMyTasks(supabase);
        setTasks(tasks);
      } catch {
        setTasks([]);
      }

      try {
        const events = await fetchMyEvents(supabase);
        setEvents(events);
      } catch {
        setEvents([]);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [clear, clearEvents, clearTasks, setEvents, setProfile, setTasks, setUser]);

  return <>{children}</>;
}

