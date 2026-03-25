import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/store/userStore";

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

