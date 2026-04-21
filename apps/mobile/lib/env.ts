import Constants from "expo-constants";

/** Reads Supabase URL + anon key from `app.config` extra (preferred) or bundled `EXPO_PUBLIC_*`. */
export function readSupabaseEnv(): { url: string; anonKey: string; isConfigured: boolean } {
  const extra = Constants.expoConfig?.extra as
    | { supabaseUrl?: string; supabaseAnonKey?: string }
    | undefined;
  const url = String(extra?.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = String(extra?.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  return { url, anonKey, isConfigured: url.length > 0 && anonKey.length > 0 };
}
