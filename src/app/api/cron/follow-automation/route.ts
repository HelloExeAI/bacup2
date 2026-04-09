import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { runFollowAutomationTick } from "@/lib/workspace/followAutomationCron";
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

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }

  const { url } = getSupabaseEnv();
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const result = await runFollowAutomationTick(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/follow-automation]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
