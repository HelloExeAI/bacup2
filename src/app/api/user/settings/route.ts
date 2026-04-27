import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTrustedDbClient } from "@/lib/supabase/service";
import {
  buildSettingsPayload,
  ensureProfileRow,
  ensureSettingsRow,
  isPermissionDenied,
  saveErrorDetails,
  trimProfileField,
  UserSettingsBodyPatchSchema,
} from "@/lib/user-settings/serverPayload";

export const dynamic = "force-dynamic";

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
    const parsed = UserSettingsBodyPatchSchema.safeParse(json);
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
