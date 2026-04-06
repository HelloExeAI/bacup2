"use client";

import * as React from "react";

import { allowPathWithoutSession } from "@/lib/auth/publicPaths";
import { getSignOutRedirectHref } from "@/lib/auth/signOutRedirect";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Task } from "@/store/taskStore";
import type { Event } from "@/store/eventStore";
import { fetchMyEvents, fetchMyProfile, fetchMyTasks } from "@/lib/supabase/queries";
import { syncPosthogPerson } from "@/lib/posthog-person";
import type { Profile } from "@/store/userStore";
import { useUserStore } from "@/store/userStore";
import { useTaskStore } from "@/store/taskStore";
import { useEventStore } from "@/store/eventStore";

export function AuthBootstrap({
  children,
  initialTasks,
  initialEvents,
  initialProfile,
}: {
  children: React.ReactNode;
  initialTasks?: Task[];
  initialEvents?: Event[];
  /** Server-loaded profile so avatar and name hydrate immediately in the top bar. */
  initialProfile?: Profile | null;
}) {
  const setUser = useUserStore((s) => s.setUser);
  const setProfile = useUserStore((s) => s.setProfile);
  const clear = useUserStore((s) => s.clear);
  const setTasks = useTaskStore((s) => s.setTasks);
  const clearTasks = useTaskStore((s) => s.clear);
  const setEvents = useEventStore((s) => s.setEvents);
  const clearEvents = useEventStore((s) => s.clear);

  React.useLayoutEffect(() => {
    if (initialProfile !== undefined) setProfile(initialProfile ?? null);
  }, [initialProfile, setProfile]);

  React.useEffect(() => {
    if (initialTasks) setTasks(initialTasks);
    if (initialEvents) setEvents(initialEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        syncPosthogPerson(null, null);
        return;
      }

      const user = session?.user ?? null;
      setUser(user);

      if (!user) {
        setProfile(null);
        clearTasks();
        clearEvents();
        syncPosthogPerson(null, null);
        if (typeof window !== "undefined" && !allowPathWithoutSession(window.location.pathname)) {
          window.location.assign(getSignOutRedirectHref());
        }
        return;
      }

      try {
        const profile = await fetchMyProfile(supabase);
        if (!cancelled) setProfile(profile);
        if (!cancelled) syncPosthogPerson(user, profile);
      } catch {
        if (!cancelled) setProfile(null);
        if (!cancelled) syncPosthogPerson(user, null);
      }

      try {
        const tasks = await fetchMyTasks(supabase);
        if (!cancelled) setTasks(tasks);
      } catch (e) {
        console.error("[auth] fetch tasks failed", e);
        if (!cancelled) setTasks([]);
      }

      try {
        const events = await fetchMyEvents(supabase);
        if (!cancelled) setEvents(events);
      } catch (e) {
        console.error("[auth] fetch events failed", e);
        if (!cancelled) setEvents([]);
      }
    }

    hydrate();

    const { data: sub } = supabase.auth.onAuthStateChange(async (evt, s) => {
      const user = s?.user ?? null;
      setUser(user);

      if (!user) {
        setProfile(null);
        clearTasks();
        clearEvents();
        syncPosthogPerson(null, null);
        if (
          evt === "SIGNED_OUT" &&
          typeof window !== "undefined" &&
          !allowPathWithoutSession(window.location.pathname)
        ) {
          window.location.assign(getSignOutRedirectHref());
        }
        return;
      }

      try {
        const profile = await fetchMyProfile(supabase);
        setProfile(profile);
        syncPosthogPerson(user, profile);
      } catch {
        setProfile(null);
        syncPosthogPerson(user, null);
      }

      try {
        const tasks = await fetchMyTasks(supabase);
        setTasks(tasks);
      } catch (e) {
        console.error("[auth] fetch tasks failed", e);
        setTasks([]);
      }

      try {
        const events = await fetchMyEvents(supabase);
        setEvents(events);
      } catch (e) {
        console.error("[auth] fetch events failed", e);
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

