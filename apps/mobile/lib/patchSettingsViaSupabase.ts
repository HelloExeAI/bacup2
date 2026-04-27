import type { User } from "@supabase/supabase-js";

import { loadSettingsPayloadFromSupabase } from "@/lib/loadSettingsPayloadFromSupabase";
import { getSupabase } from "@/lib/supabase";
import type { SettingsPayload } from "@/lib/settingsTypes";

/** Keys allowed on `user_settings` PATCH (mirrors server `SettingsPatchSchema`). */
const PATCHABLE_USER_SETTINGS_KEYS = new Set([
  "preferred_language",
  "assistant_tone",
  "daily_briefing_style",
  "voice_input_mode",
  "voice_input_language",
  "voice_output_language",
  "noise_suppression",
  "auto_detect_speakers",
  "live_transcription",
  "voice_sensitivity",
  "smart_reminders",
  "followup_nudges",
  "overdue_alerts",
  "followup_communication_channel",
  "followup_email_subject_template",
  "followup_email_body_template",
  "daily_briefing_notification_time",
  "notification_sound",
  "event_reminders",
  "team_chat_settings",
  "billing_plan",
  "subscription_tier",
  "billing_interval",
  "subscription_status",
  "current_period_end",
  "ask_bacup_addon",
  "date_display_format",
  "clock_display_format",
]);

function trimField(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function sanitizeSettingsPatch(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (PATCHABLE_USER_SETTINGS_KEYS.has(k)) out[k] = v;
  }
  return out;
}

/**
 * When `PATCH /api/mobile/user/settings` is missing (404) or unavailable, apply the same
 * changes with the signed-in Supabase client (RLS) and return the same payload shape as GET.
 */
export async function patchSettingsViaSupabase(
  user: User,
  body: Record<string, unknown>,
): Promise<SettingsPayload> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase is not configured.");

  const userId = user.id;

  const { data: existingSettings } = await sb.from("user_settings").select("user_id").eq("user_id", userId).maybeSingle();
  if (!existingSettings) {
    await sb.from("user_settings").upsert({ user_id: userId }, { onConflict: "user_id" });
  }

  const { data: existingProfile } = await sb.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!existingProfile) {
    const meta = user.user_metadata as Record<string, unknown> | undefined;
    const metaName =
      meta && typeof meta.full_name === "string" && meta.full_name.trim() ? String(meta.full_name).trim() : null;
    const fromEmail = user.email?.split("@")[0]?.trim() || null;
    const { error: insErr } = await sb.from("profiles").insert({
      id: userId,
      name: metaName ?? fromEmail,
      role: "member",
    });
    if (insErr) {
      const code = "code" in insErr ? String((insErr as { code?: string }).code) : "";
      const msg = String((insErr as { message?: string }).message || "");
      if (code !== "23505" && !msg.toLowerCase().includes("duplicate")) throw new Error(msg || "Could not create profile");
    }
  }

  if (typeof body.email === "string") {
    const next = body.email.trim().toLowerCase();
    const cur = (user.email ?? "").trim().toLowerCase();
    if (next && next !== cur) {
      const { error: emailErr } = await sb.auth.updateUser({ email: next });
      if (emailErr) throw new Error(emailErr.message);
    }
  }

  const profile = body.profile;
  if (profile && typeof profile === "object" && profile !== null) {
    const p = profile as Record<string, unknown>;
    const row: Record<string, unknown> = {};

    if ("phone" in p) {
      row.phone =
        p.phone === null ? null : String(p.phone).replace(/\D/g, "").slice(0, 30) || null;
    }
    if ("phone_country_code" in p) {
      const c = p.phone_country_code === null ? null : String(p.phone_country_code).trim();
      row.phone_country_code = c && /^\+\d{1,4}$/.test(c) ? c : null;
    }
    if ("phone" in p && row.phone == null) {
      row.phone_country_code = null;
    }
    if ("timezone" in p) row.timezone = p.timezone === null ? null : trimField(p.timezone);
    if ("location" in p) row.location = p.location === null ? null : trimField(p.location);
    if ("avatar_url" in p) row.avatar_url = p.avatar_url === null ? null : trimField(p.avatar_url);
    if ("first_name" in p) row.first_name = trimField(p.first_name);
    if ("middle_name" in p) row.middle_name = trimField(p.middle_name);
    if ("last_name" in p) row.last_name = trimField(p.last_name);
    if ("display_name" in p) row.display_name = trimField(p.display_name);

    const touchedLegal =
      "first_name" in p || "middle_name" in p || "last_name" in p || "display_name" in p;
    if (touchedLegal) {
      const f = "first_name" in p ? trimField(p.first_name) : undefined;
      const m = "middle_name" in p ? trimField(p.middle_name) : undefined;
      const l = "last_name" in p ? trimField(p.last_name) : undefined;
      const parts = [f, m, l].filter((x): x is string => x != null && x !== "");
      if ("display_name" in p) {
        const d = trimField(p.display_name);
        row.name = d != null && d !== "" ? d : (parts.length ? parts.join(" ") : null);
      } else {
        row.name = parts.length ? parts.join(" ") : null;
      }
    }

    const cleanProfile = Object.fromEntries(
      Object.entries(row).filter(([, v]) => v !== undefined),
    ) as Record<string, unknown>;
    if (Object.keys(cleanProfile).length > 0) {
      const { error } = await sb.from("profiles").update(cleanProfile).eq("id", userId);
      if (error) throw new Error(error.message);
    }
  }

  const settings = body.settings;
  if (settings && typeof settings === "object" && settings !== null) {
    const patch = sanitizeSettingsPatch(settings as Record<string, unknown>);
    if (Object.keys(patch).length > 0) {
      const { error } = await sb
        .from("user_settings")
        .update({
          ...patch,
          clock_timezone_source: "device",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
  }

  const {
    data: { user: fresh },
    error: freshErr,
  } = await sb.auth.getUser();
  if (freshErr || !fresh) throw new Error(freshErr?.message ?? "Could not refresh session after save");

  const payload = await loadSettingsPayloadFromSupabase(fresh);
  if (!payload) throw new Error("Saved locally but could not reload settings.");
  return payload;
}
