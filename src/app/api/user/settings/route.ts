import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";

import { DEPARTMENT_LABEL, isWorkspaceDepartmentId } from "@/lib/workspace/departments";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTrustedDbClient } from "@/lib/supabase/service";
import { normalizeUserSettingsRow } from "@/modules/settings/normalizeUserSettings";
import type { SettingsPayload } from "@/modules/settings/types";

export const dynamic = "force-dynamic";

/** HTML time inputs often send `HH:MM:SS`; DB stores `HH:MM`. */
function normalizeBriefingTime(val: unknown): string | null | undefined {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (typeof val !== "string") return undefined;
  const s = val.trim();
  if (s === "") return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(s);
  if (!m) return undefined;
  const hh = String(Math.min(23, Math.max(0, Number(m[1]) || 0))).padStart(2, "0");
  const mm = String(Math.min(59, Math.max(0, Number(m[2]) || 0))).padStart(2, "0");
  return `${hh}:${mm}`;
}

const ProfilePatchSchema = z
  .object({
    first_name: z.union([z.string().max(100), z.null()]).optional(),
    middle_name: z.union([z.string().max(100), z.null()]).optional(),
    last_name: z.union([z.string().max(100), z.null()]).optional(),
    display_name: z.union([z.string().max(200), z.null()]).optional(),
    phone: z.union([z.string().max(30), z.null()]).optional(),
    phone_country_code: z.union([z.string().regex(/^\+\d{1,4}$/), z.null()]).optional(),
    timezone: z.union([z.string().max(100), z.null()]).optional(),
    location: z.union([z.string().max(200), z.null()]).optional(),
    avatar_url: z.union([z.string().max(2000), z.null()]).optional(),
  })
  .strict();

function trimProfileField(v: string | null | undefined | unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

const SettingsPatchSchema = z
  .object({
    preferred_language: z.string().max(32).optional(),
    assistant_tone: z.enum(["direct", "balanced", "detailed"]).optional(),
    daily_briefing_style: z.enum(["ultra_concise", "standard"]).optional(),
    voice_input_mode: z.enum(["auto", "manual"]).optional(),
    voice_input_language: z.union([z.string().max(32), z.null()]).optional(),
    voice_output_language: z.string().max(32).optional(),
    noise_suppression: z.boolean().optional(),
    auto_detect_speakers: z.boolean().optional(),
    live_transcription: z.boolean().optional(),
    voice_sensitivity: z.enum(["low", "medium", "high"]).optional(),
    smart_reminders: z.boolean().optional(),
    followup_nudges: z.boolean().optional(),
    overdue_alerts: z.boolean().optional(),
    followup_communication_channel: z.enum(["email", "whatsapp", "slack"]).optional(),
    followup_email_subject_template: z.string().min(1).max(500).optional(),
    followup_email_body_template: z.string().min(1).max(20000).optional(),
    daily_briefing_notification_time: z.preprocess(normalizeBriefingTime, z.union([z.string().regex(/^\d{2}:\d{2}$/), z.null()]).optional()),
    notification_sound: z
      .enum([
        "none",
        "notif_1",
        "notif_2",
        "notif_3",
        "notif_4",
        "notif_5",
        "notif_6",
        "notif_7",
        "notif_8",
      ])
      .optional(),
    event_reminders: z.boolean().optional(),
    team_chat_settings: z.any().optional(),
    billing_plan: z.string().max(64).optional(),
    subscription_tier: z.enum(["solo_os", "operator_os", "executive_os"]).optional(),
    billing_interval: z.enum(["monthly", "yearly"]).optional(),
    subscription_status: z.enum(["active", "trial", "expired", "canceled"]).optional(),
    current_period_end: z.union([z.string().max(40), z.null()]).optional(),
    ask_bacup_addon: z.boolean().optional(),
    date_display_format: z.enum(["ymd", "dmy", "mdy"]).optional(),
    clock_display_format: z.enum(["12h", "24h"]).optional(),
  })
  .strict();

const PatchSchema = z
  .object({
    /** Updates `auth.users.email` via Supabase Auth (may require confirmation per project settings). */
    email: z.string().trim().email().max(320).optional(),
    profile: ProfilePatchSchema.optional(),
    settings: SettingsPatchSchema.optional(),
  })
  .strict();

function isPermissionDenied(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const code = "code" in e ? String((e as { code: unknown }).code) : "";
  const msg = "message" in e ? String((e as { message: unknown }).message) : "";
  return code === "42501" || msg.includes("permission denied for schema public");
}

/** Surface DB/PostgREST messages so saves are debuggable (e.g. missing migration columns). */
function saveErrorDetails(e: unknown): string | undefined {
  if (!e || typeof e !== "object") return undefined;
  const o = e as { message?: unknown; details?: unknown; hint?: unknown };
  const parts: string[] = [];
  if (typeof o.message === "string" && o.message.trim()) parts.push(o.message.trim());
  if (typeof o.details === "string" && o.details.trim()) parts.push(o.details.trim());
  if (typeof o.hint === "string" && o.hint.trim()) parts.push(o.hint.trim());
  const s = parts.join(" — ");
  return s.length > 0 && s.length < 500 ? s : parts[0];
}

async function ensureSettingsRow(db: SupabaseClient, userId: string) {
  const { data: existing } = await db.from("user_settings").select("user_id").eq("user_id", userId).maybeSingle();
  if (existing) return;
  const { error } = await db.from("user_settings").insert({ user_id: userId });
  if (error) {
    console.error("[user/settings] ensureSettingsRow insert", error);
    throw error;
  }
}

/** Some accounts pre-date triggers; guarantee a `profiles` row for this user. */
async function ensureProfileRow(db: SupabaseClient, user: User) {
  const { data: existing, error: exErr } = await db.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (exErr) throw exErr;
  if (existing) return;

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const metaName =
    meta && typeof meta.full_name === "string" && meta.full_name.trim() ? meta.full_name.trim() : null;
  const fromEmail = user.email?.split("@")[0]?.trim() || null;

  const { error } = await db.from("profiles").insert({
    id: user.id,
    name: metaName ?? fromEmail,
    role: "member",
  });
  if (error) {
    const code = "code" in error ? String((error as { code?: string }).code) : "";
    const msg = String((error as { message?: string }).message || "");
    if (code === "23505" || msg.toLowerCase().includes("duplicate")) return;
    throw error;
  }
}

async function fetchUserSettingsRow(db: SupabaseClient, userId: string) {
  const first = await db.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
  if (first.error) throw first.error;
  let settings = first.data;
  if (!settings) {
    await ensureSettingsRow(db, userId);
    const second = await db.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
    if (second.error) throw second.error;
    settings = second.data;
  }
  return settings;
}

async function buildSettingsPayloadWithDb(user: User, db: SupabaseClient): Promise<SettingsPayload> {
  await ensureProfileRow(db, user);
  await ensureSettingsRow(db, user.id);

  const { data: profile, error: pErr } = await db
    .from("profiles")
    .select(
      "id,name,role,created_at,phone,phone_country_code,timezone,location,avatar_url,first_name,middle_name,last_name,display_name",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (pErr) throw pErr;

  const settingsRaw = await fetchUserSettingsRow(db, user.id);
  if (!settingsRaw) {
    throw new Error("user_settings row missing after ensure; check RLS and migrations");
  }

  const settings = normalizeUserSettingsRow(user.id, settingsRaw as Record<string, unknown>);

  const connectedRes = await db
    .from("user_connected_accounts")
    .select("id,user_id,provider,account_email,display_name,created_at,provider_subject,scopes")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (connectedRes.error) {
    console.warn("[user/settings] user_connected_accounts:", connectedRes.error.message);
  }
  const connectedAccounts = (connectedRes.data ?? []) as SettingsPayload["connectedAccounts"];

  const teamRes = await db
    .from("team_members")
    .select("id,member_user_id,display_name,status")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: true });
  if (teamRes.error) {
    console.warn("[user/settings] team_members:", teamRes.error.message);
  }
  const teamRows = teamRes.data ?? [];

  const ids = teamRows.map((r) => r.id);
  let perms: Array<{ team_member_id: string; can_view_dashboard_for_others: boolean }> = [];
  if (ids.length > 0) {
    const permRes = await db
      .from("team_member_permissions")
      .select("team_member_id,can_view_dashboard_for_others")
      .in("team_member_id", ids);
    if (permRes.error) {
      console.warn("[user/settings] team_member_permissions:", permRes.error.message);
    } else {
      perms = permRes.data ?? [];
    }
  }

  const permMap = new Map(perms.map((p) => [p.team_member_id, p.can_view_dashboard_for_others]));

  const deptLabelByMemberUserId = new Map<string, string>();
  if (teamRows.length > 0) {
    const assignRes = await db
      .from("workspace_department_assignments")
      .select("user_id, department")
      .eq("workspace_owner_id", user.id);
    if (!assignRes.error && assignRes.data) {
      for (const row of assignRes.data) {
        const uid = String((row as { user_id: string }).user_id);
        const d = String((row as { department: string }).department);
        if (isWorkspaceDepartmentId(d)) deptLabelByMemberUserId.set(uid, DEPARTMENT_LABEL[d]);
      }
    }
  }

  const teamMembers = teamRows.map((r) => ({
    id: r.id,
    member_user_id: r.member_user_id,
    display_name: r.display_name,
    status: r.status,
    can_view_dashboard_for_others: Boolean(permMap.get(r.id)),
    department: deptLabelByMemberUserId.get(String(r.member_user_id)) ?? null,
  }));

  return {
    email: user.email ?? null,
    profile: {
      id: profile?.id ?? user.id,
      name: profile?.name ?? null,
      created_at: profile?.created_at ?? null,
      first_name: profile?.first_name ?? null,
      middle_name: profile?.middle_name ?? null,
      last_name: profile?.last_name ?? null,
      display_name: profile?.display_name ?? null,
      role: String(profile?.role ?? "member"),
      phone: profile?.phone ?? null,
      phone_country_code: profile?.phone_country_code ?? null,
      timezone: profile?.timezone ?? null,
      location: profile?.location ?? null,
      avatar_url: profile?.avatar_url ?? null,
    },
    settings,
    connectedAccounts,
    teamMembers,
  };
}

async function buildSettingsPayload(user: User, auth: SupabaseClient): Promise<SettingsPayload> {
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  if (hasServiceKey) {
    try {
      return await buildSettingsPayloadWithDb(user, getTrustedDbClient(auth));
    } catch (e) {
      if (isPermissionDenied(e)) {
        console.warn(
          "[user/settings] service_role key rejected by DB (wrong key or project mismatch); using session client",
        );
        return buildSettingsPayloadWithDb(user, auth);
      }
      throw e;
    }
  }
  return buildSettingsPayloadWithDb(user, auth);
}

export async function GET() {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await auth.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await buildSettingsPayload(user, auth);

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (e) {
    console.error("[user/settings GET]", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: "Failed to load settings",
        ...(process.env.NODE_ENV === "development" ? { details: message } : {}),
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await auth.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json().catch(() => null);
    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
    }

    const db = await (async () => {
      const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
      if (!hasServiceKey) {
        await ensureSettingsRow(auth, user.id);
        await ensureProfileRow(auth, user);
        return auth;
      }
      const trusted = getTrustedDbClient(auth);
      try {
        await ensureSettingsRow(trusted, user.id);
        await ensureProfileRow(trusted, user);
        return trusted;
      } catch (e) {
        if (isPermissionDenied(e)) {
          console.warn("[user/settings] PATCH: service_role denied; using session client for DB");
          await ensureSettingsRow(auth, user.id);
          await ensureProfileRow(auth, user);
          return auth;
        }
        throw e;
      }
    })();

    if (parsed.data.email !== undefined) {
      const next = parsed.data.email.trim().toLowerCase();
      const current = (user.email ?? "").trim().toLowerCase();
      if (next !== current) {
        const { error: emailErr } = await auth.auth.updateUser({ email: next });
        if (emailErr) {
          return NextResponse.json({ error: emailErr.message }, { status: 400 });
        }
      }
    }

    if (parsed.data.profile) {
      const p = parsed.data.profile;
      const row: Record<string, unknown> = {};
      if (p.phone !== undefined) {
        row.phone =
          p.phone === null
            ? null
            : String(p.phone).replace(/\D/g, "").slice(0, 30) || null;
      }
      if (p.phone_country_code !== undefined) {
        const c = p.phone_country_code === null ? null : String(p.phone_country_code).trim();
        row.phone_country_code = c && /^\+\d{1,4}$/.test(c) ? c : null;
      }
      if (p.phone !== undefined && row.phone == null) {
        row.phone_country_code = null;
      }
      if (p.timezone !== undefined) row.timezone = p.timezone;
      if (p.location !== undefined) row.location = p.location;
      if (p.avatar_url !== undefined) row.avatar_url = p.avatar_url;
      if (p.first_name !== undefined) row.first_name = trimProfileField(p.first_name);
      if (p.middle_name !== undefined) row.middle_name = trimProfileField(p.middle_name);
      if (p.last_name !== undefined) row.last_name = trimProfileField(p.last_name);
      if (p.display_name !== undefined) row.display_name = trimProfileField(p.display_name);

      const touchedLegal =
        p.first_name !== undefined ||
        p.middle_name !== undefined ||
        p.last_name !== undefined ||
        p.display_name !== undefined;
      if (touchedLegal) {
        const f = p.first_name !== undefined ? trimProfileField(p.first_name) : undefined;
        const m = p.middle_name !== undefined ? trimProfileField(p.middle_name) : undefined;
        const l = p.last_name !== undefined ? trimProfileField(p.last_name) : undefined;
        const parts = [f, m, l].filter((x): x is string => x != null && x !== "");
        if (p.display_name !== undefined) {
          const d = trimProfileField(p.display_name);
          row.name = d != null && d !== "" ? d : (parts.length ? parts.join(" ") : null);
        } else {
          row.name = parts.length ? parts.join(" ") : null;
        }
      }

      const { data: existingProfile, error: existErr } = await db
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (existErr) throw existErr;

      if (existingProfile) {
        const { error } = await db.from("profiles").update(row).eq("id", user.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("profiles").insert({
          id: user.id,
          role: "member",
          ...row,
        });
        if (error) throw error;
      }
    }

    if (parsed.data.settings) {
      const { error } = await db
        .from("user_settings")
        .update({
          ...parsed.data.settings,
          /** Clock always follows the browser zone (with profile/UTC fallbacks in `resolveClockTimeZone`). */
          clock_timezone_source: "device",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
      if (error) throw error;
    }

    const {
      data: { user: freshUser },
      error: freshErr,
    } = await auth.auth.getUser();
    if (freshErr || !freshUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await buildSettingsPayload(freshUser, auth);

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (e) {
    console.error("[user/settings PATCH]", e);
    const details = saveErrorDetails(e);
    return NextResponse.json(
      {
        error: "Failed to save settings",
        ...(details ? { details } : {}),
      },
      { status: 500 },
    );
  }
}
