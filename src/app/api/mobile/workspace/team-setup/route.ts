import { NextResponse } from "next/server";

import { supabaseFromBearer } from "@/lib/supabase/bearerFromRequest";
import { teamSetupGetHandler, teamSetupPatchHandler } from "@/lib/workspace/teamSetupHandlers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = supabaseFromBearer(req);
  if (!supabase) {
    return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return teamSetupGetHandler(supabase, user);
}

export async function PATCH(req: Request) {
  const supabase = supabaseFromBearer(req);
  if (!supabase) {
    return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return teamSetupPatchHandler(supabase, user, req);
}
