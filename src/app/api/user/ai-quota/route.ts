import { NextResponse } from "next/server";

import { fetchAiQuotaSnapshot } from "@/lib/billing/aiQuota";
import { AI_ADDON_CATALOG, allPlansForDisplay, planQuotas } from "@/lib/billing/planCatalog";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const snapshot = await fetchAiQuotaSnapshot(supabase, user.id);

    const { data: profile } = await supabase.from("profiles").select("created_at").eq("id", user.id).maybeSingle();
    const subscriptionStartedAtIso =
      (typeof profile?.created_at === "string" && profile.created_at.trim()) ||
      (typeof user.created_at === "string" && user.created_at.trim()) ||
      null;

    return NextResponse.json(
      {
        subscriptionStartedAtIso,
        snapshot,
        plans: allPlansForDisplay(),
        addons: AI_ADDON_CATALOG,
        currentPlanDetail: planQuotas(snapshot.plan),
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (e) {
    console.error("[user/ai-quota]", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Failed to load AI quota", ...(process.env.NODE_ENV === "development" ? { details: message } : {}) },
      { status: 500 },
    );
  }
}
