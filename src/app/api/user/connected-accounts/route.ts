import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const PostSchema = z.object({
  provider: z.enum(["google", "microsoft"]),
  /** Optional; defaults to signed-in user email for demo connect flow. */
  account_email: z.string().email().optional(),
});

const PatchSchema = z.object({
  id: z.string().uuid(),
  display_name: z.union([z.string().max(120), z.null()]),
});

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("user_connected_accounts")
      .select("id,user_id,provider,account_email,display_name,created_at,provider_subject,scopes")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ accounts: data ?? [] });
  } catch (e) {
    console.error("[connected-accounts GET]", e);
    return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 });
  }
}

/**
 * Demo connect for Microsoft (metadata only).
 * Google must use `/api/integrations/google/start` so tokens and scopes are stored correctly.
 */
export async function PATCH(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json().catch(() => null);
    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { id, display_name } = parsed.data;
    const normalized =
      display_name === null ? null : display_name.trim() === "" ? null : display_name.trim();

    const { error } = await supabase
      .from("user_connected_accounts")
      .update({ display_name: normalized })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[connected-accounts PATCH]", e);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json().catch(() => null);
    const parsed = PostSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    if (parsed.data.provider === "google") {
      return NextResponse.json(
        {
          error: "Connect Google via Settings → Integrations → “Connect with Google” (OAuth).",
        },
        { status: 400 },
      );
    }

    if (parsed.data.provider === "microsoft") {
      return NextResponse.json(
        {
          error: "Connect Microsoft via Settings → Integrations → “Connect with Microsoft” (OAuth).",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "Use OAuth in Settings → Integrations to connect accounts." }, { status: 400 });
  } catch (e) {
    console.error("[connected-accounts POST]", e);
    return NextResponse.json({ error: "Failed to connect account" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { error } = await supabase.from("user_connected_accounts").delete().eq("id", id).eq("user_id", user.id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[connected-accounts DELETE]", e);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
