import { NextResponse } from "next/server";
import { z } from "zod";

import { supabaseFromBearer } from "@/lib/supabase/bearerFromRequest";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  newPassword: z.string().min(8).max(128),
});

/** Same as POST /api/user/password with Bearer auth. */
export async function POST(req: Request) {
  try {
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

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Password must be 8–128 characters" }, { status: 400 });
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[mobile/user/password POST]", e);
    return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
  }
}
