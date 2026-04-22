import type { Session, User } from "@supabase/supabase-js";
import * as React from "react";
import { AppState } from "react-native";

import { getSupabase } from "@/lib/supabase";

export type TaskRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  title: string;
  status: string;
  due_date: string;
  due_time?: string | null;
  type?: string;
};

export type EventRow = Record<string, unknown> & {
  id: string;
  title: string | null;
  date: string | null;
  time: string | null;
  linked_task_id?: string | null;
};

type AuthCtx = {
  /** Supabase session (use `access_token` for Bearer API calls to the web app). */
  session: Session | null;
  user: User | null;
  loading: boolean;
  tasks: TaskRow[];
  events: EventRow[];
  refreshData: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const Ctx = React.createContext<AuthCtx | null>(null);

async function loadTasks(sb: NonNullable<ReturnType<typeof getSupabase>>): Promise<TaskRow[]> {
  const { data, error } = await sb.from("tasks").select("*").order("created_at", { ascending: false });
  if (error) {
    console.warn("[bacup-mobile] tasks", error.message);
    return [];
  }
  return (data ?? []) as TaskRow[];
}

async function loadEvents(sb: NonNullable<ReturnType<typeof getSupabase>>): Promise<EventRow[]> {
  const { data, error } = await sb
    .from("events")
    .select("*")
    .order("date", { ascending: true })
    .order("time", { ascending: true, nullsFirst: false });
  if (error) {
    console.warn("[bacup-mobile] events", error.message);
    return [];
  }
  return (data ?? []) as EventRow[];
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [tasks, setTasks] = React.useState<TaskRow[]>([]);
  const [events, setEvents] = React.useState<EventRow[]>([]);

  const refreshData = React.useCallback(async () => {
    const sb = getSupabase();
    if (!sb) {
      setTasks([]);
      setEvents([]);
      return;
    }
    const [t, e] = await Promise.all([loadTasks(sb), loadEvents(sb)]);
    setTasks(t);
    setEvents(e);
  }, []);

  React.useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const { data } = await sb.auth.getSession();
        if (cancelled) return;
        setSession(data.session ?? null);
        // Never block the initial render on network calls.
        if (data.session?.user) void refreshData();
      } catch (e) {
        console.warn(
          "[bacup-mobile] auth.getSession failed",
          e instanceof Error ? e.message : String(e),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const { data: sub } = sb.auth.onAuthStateChange(async (_evt, s) => {
      setSession(s);
      if (s?.user) void refreshData();
      else {
        setTasks([]);
        setEvents([]);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [refreshData]);

  const userId = session?.user?.id;

  React.useEffect(() => {
    if (!userId) return;
    const sb = getSupabase();
    if (!sb) return;

    const channel = sb
      .channel(`mobile-sync-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` },
        () => {
          void refreshData();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `user_id=eq.${userId}` },
        () => {
          void refreshData();
        },
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [userId, refreshData]);

  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && session?.user) void refreshData();
    });
    return () => sub.remove();
  }, [session?.user, refreshData]);

  const signIn = React.useCallback(async (email: string, password: string) => {
    const sb = getSupabase();
    if (!sb) return { error: "Supabase is not configured." };
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const signOut = React.useCallback(async () => {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
  }, []);

  const value = React.useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      tasks,
      events,
      refreshData,
      signIn,
      signOut,
    }),
    [session, loading, tasks, events, refreshData, signIn, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
