import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "./env";

/**
 * Prefer service-role DB access (bypasses RLS) when `SUPABASE_SERVICE_ROLE_KEY` is set.
 * Otherwise uses the same cookie-bound client as `auth` so settings still load without the secret.
 */
export function getTrustedDbClient(authClient: SupabaseClient): SupabaseClient {
  const { url } = getSupabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return authClient;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
