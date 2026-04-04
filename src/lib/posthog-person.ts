import posthog from "posthog-js";
import type { User } from "@supabase/supabase-js";

import type { Profile } from "@/store/userStore";

/**
 * Person list label: **first + last name** from Bacup profile when either is set;
 * otherwise **full email**; last resort short id.
 * (In PostHog → Project → Person display name, put **name** above **email** so this wins over email.)
 */
function personDisplayLabel(user: User, profile: Profile | null): string {
  const fn = profile?.first_name?.trim() ?? "";
  const ln = profile?.last_name?.trim() ?? "";
  const fromNames = [fn, ln].filter(Boolean).join(" ").trim();
  if (fromNames) return fromNames;

  const email = user.email?.trim() ?? "";
  if (email) return email;

  return `User ${user.id.slice(0, 8)}`;
}

/**
 * Keeps PostHog persons aligned with Bacup profile so the UI shows a real name, not only UUID.
 * Safe to call from client only; no-ops on the server or when PostHog isn’t configured.
 */
export function syncPosthogPerson(user: User | null, profile: Profile | null) {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;

  if (!user?.id) {
    posthog.reset();
    return;
  }

  const label = personDisplayLabel(user, profile);
  const fn = profile?.first_name?.trim() ?? "";
  const ln = profile?.last_name?.trim() ?? "";

  // 1) Bind distinct_id (and merge anonymous → user when applicable).
  posthog.identify(user.id);

  // 2) Always send a dedicated `$set` with display fields. Relying only on
  // `identify(id, props)` can be flaky once the user is already identified
  // (dedupe / ordering). Project “Person display name” often checks email, name, username.
  const props: Record<string, string> = {
    name: label,
    username: label,
    display_name: label,
  };
  if (user.email) props.email = user.email;
  if (fn) props.first_name = fn;
  if (ln) props.last_name = ln;

  posthog.setPersonProperties(props);
}
