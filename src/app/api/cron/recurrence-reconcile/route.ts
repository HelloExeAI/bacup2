import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { ensurePendingInstanceAfterDelete } from "@/lib/recurrence/materialize";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7).trim() === secret;
  }
  const header = req.headers.get("x-cron-secret");
  if (header?.trim() === secret) return true;

  return false;
}

/**
 * Server cron (e.g. Vercel Cron): reconciles recurrence for **all** users with active series.
 * Requires `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` in the environment.
 */
async function runCron() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    return NextResponse.json(
      { error: "cron_not_configured", hint: "Set SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 },
    );
  }

  const { url } = getSupabaseEnv();
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error } = await admin
    .from("task_recurrence_series")
    .select("id,user_id")
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let checked = 0;
  let created = 0;
  for (const row of rows ?? []) {
    const uid = typeof row.user_id === "string" ? row.user_id : "";
    const sid = typeof row.id === "string" ? row.id : "";
    if (!uid || !sid) continue;
    checked += 1;
    const res = await ensurePendingInstanceAfterDelete(admin, uid, sid);
    if (res.created) created += 1;
  }

  return NextResponse.json({
    ok: true,
    checked,
    created,
    series: (rows ?? []).length,
  });
}

export async function POST(req: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      { error: "cron_not_configured", hint: "Set CRON_SECRET" },
      { status: 503 },
    );
  }
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runCron();
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      { error: "cron_not_configured", hint: "Set CRON_SECRET" },
      { status: 503 },
    );
  }
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runCron();
}
