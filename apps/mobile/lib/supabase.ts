import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { readSupabaseEnv } from "@/lib/env";

let client: SupabaseClient | null = null;

/** Returns null if `.env` is missing or keys are empty — do not call network APIs until configured. */
export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const { url, anonKey, isConfigured } = readSupabaseEnv();
  if (!isConfigured) {
    return null;
  }
  client = createClient(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
