import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/store/userStore";
import type { Task } from "@/store/taskStore";
import type { Event } from "@/store/eventStore";

export async function fetchMyProfile(
  supabase: SupabaseClient,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,name,role,created_at")
    .maybeSingle();

  if (error) throw error;
  return data as Profile | null;
}

export async function fetchMyTasks(supabase: SupabaseClient): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function fetchMyEvents(supabase: SupabaseClient): Promise<Event[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("date", { ascending: true })
    .order("time", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as Event[];
}

