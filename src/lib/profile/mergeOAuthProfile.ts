import type { SupabaseClient } from "@supabase/supabase-js";

function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

export type OAuthProfilePatch = {
  first_name?: string | null;
  last_name?: string | null;
  /** Full display string from provider (e.g. Google `name`, Graph `displayName`). */
  full_name?: string | null;
  /** Public HTTPS URL (e.g. Google `picture`). */
  avatar_url?: string | null;
};

/**
 * When the connected OAuth account email matches the Supabase auth email, copy
 * name + avatar into `profiles` so Bacup matches Google / Microsoft identity.
 */
export async function mergePrimaryOAuthIntoProfile(
  supabase: SupabaseClient,
  params: {
    userId: string;
    authEmail: string | null | undefined;
    oauthEmail: string;
    patch: OAuthProfilePatch;
  },
): Promise<void> {
  if (!emailsMatch(params.authEmail, params.oauthEmail)) return;

  const first = params.patch.first_name?.trim() || null;
  const last = params.patch.last_name?.trim() || null;
  const full = params.patch.full_name?.trim() || null;
  const display = full || [first, last].filter(Boolean).join(" ").trim() || null;
  const avatar = params.patch.avatar_url?.trim() || null;

  const updates: Record<string, string> = {};
  if (first) updates.first_name = first;
  if (last) updates.last_name = last;
  if (display) {
    updates.display_name = display;
    updates.name = display;
  }
  if (avatar) updates.avatar_url = avatar;

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase.from("profiles").update(updates).eq("id", params.userId);
  if (error) console.warn("[mergePrimaryOAuthIntoProfile]", error.message);
}

/** Microsoft Graph photo is not a stable public URL; upload to Supabase Storage `avatars`. */
export async function uploadMicrosoftGraphPhotoToAvatar(
  supabase: SupabaseClient,
  userId: string,
  accessToken: string,
): Promise<string | null> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me/photo/$value", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length < 32) return null;
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const path = `${userId}/avatar.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, buf, {
    contentType,
    upsert: true,
  });
  if (error) {
    console.warn("[uploadMicrosoftGraphPhotoToAvatar]", error.message);
    return null;
  }
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}
