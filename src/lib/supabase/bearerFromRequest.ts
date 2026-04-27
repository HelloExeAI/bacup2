import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/supabase/env";

/** Supabase client scoped to `Authorization: Bearer <access_token>`. */
export function supabaseFromBearer(req: Request): SupabaseClient | null {
  const raw = req.headers.get("authorization")?.trim();
  const token = raw?.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : null;
  if (!token) return null;
  const { url, anonKey } = getSupabaseEnv();
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
