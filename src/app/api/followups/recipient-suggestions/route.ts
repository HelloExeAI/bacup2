import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import type { FollowupRecipientSuggestion } from "@/lib/followups/recipientSuggestionTypes";
import {
  GOOGLE_OTHER_CONTACTS_MIN_QUERY,
  GooglePeopleSearchError,
  searchGoogleOtherContacts,
} from "@/lib/integrations/google/googleOtherContactsSearch";
import { getValidGoogleAccessToken, GoogleIntegrationError } from "@/lib/integrations/google/googleAccessToken";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function sanitizeQuery(q: string): string {
  return q.replace(/[%_\\]/g, "").trim().slice(0, 64);
}

function matchesQuery(q: string, email: string, label: string): boolean {
  if (!q) return true;
  const e = email.toLowerCase();
  const l = label.toLowerCase();
  return e.includes(q) || l.includes(q);
}

async function resolveMemberEmails(memberUserIds: string[]): Promise<Map<string, string>> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key || memberUserIds.length === 0) return new Map();
  const { url } = getSupabaseEnv();
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const out = new Map<string, string>();
  const chunk = 8;
  for (let i = 0; i < memberUserIds.length; i += chunk) {
    const slice = memberUserIds.slice(i, i + chunk);
    await Promise.all(
      slice.map(async (id) => {
        const { data, error } = await admin.auth.admin.getUserById(id);
        if (error || !data.user?.email) return;
        out.set(id, normalizeEmail(data.user.email));
      }),
    );
  }
  return out;
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const qRaw = sanitizeQuery(url.searchParams.get("q") ?? "");
  const q = qRaw.toLowerCase();
  const limit = Math.min(25, Math.max(1, Number(url.searchParams.get("limit")) || 14));
  const preferredGoogleId = url.searchParams.get("google_account_id")?.trim() ?? "";

  const byEmail = new Map<string, { email: string; label: string; subtitle: string }>();

  const accRes = await supabase
    .from("user_connected_accounts")
    .select("id, account_email, provider")
    .eq("user_id", user.id);

  if (!accRes.error && accRes.data) {
    for (const row of accRes.data) {
      const em = normalizeEmail(String(row.account_email ?? ""));
      if (!isEmail(em) || byEmail.has(em)) continue;
      const p = String(row.provider ?? "");
      const sub =
        p === "google"
          ? "Connected Google account"
          : p === "microsoft"
            ? "Connected Microsoft account"
            : p === "imap"
              ? "Connected email account"
              : "Connected account";
      byEmail.set(em, { email: em, label: em, subtitle: sub });
    }
  }

  const teamRes = await supabase
    .from("team_members")
    .select("member_user_id, display_name, status")
    .eq("owner_user_id", user.id)
    .eq("status", "active");

  if (!teamRes.error && teamRes.data?.length) {
    const memberIds = [...new Set(teamRes.data.map((r) => String(r.member_user_id)))];
    const emailByMemberId = await resolveMemberEmails(memberIds);
    for (const row of teamRes.data) {
      const mid = String(row.member_user_id);
      const email = emailByMemberId.get(mid);
      if (!email || !isEmail(email)) continue;
      const dn = row.display_name?.trim();
      const label = dn && !dn.includes("@") ? dn : email;
      byEmail.set(email, { email, label, subtitle: "Team member" });
    }
  }

  const histRes = await supabase
    .from("assignee_followup_tokens")
    .select("assignee_email, created_at")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(400);

  if (!histRes.error && histRes.data) {
    const seenHist = new Set<string>();
    for (const row of histRes.data) {
      const em = normalizeEmail(String(row.assignee_email ?? ""));
      if (!isEmail(em) || seenHist.has(em)) continue;
      seenHist.add(em);
      if (!byEmail.has(em)) {
        byEmail.set(em, { email: em, label: em, subtitle: "Past follow-up" });
      }
    }
  }

  const taskRes = await supabase
    .from("tasks")
    .select("assigned_to, updated_at")
    .eq("user_id", user.id)
    .neq("assigned_to", "self")
    .not("assigned_to", "is", null)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (!taskRes.error && taskRes.data) {
    const seenT = new Set<string>();
    for (const row of taskRes.data) {
      const raw = String(row.assigned_to ?? "").trim();
      if (!raw || raw.toLowerCase() === "self") continue;
      if (!isEmail(raw)) continue;
      const em = normalizeEmail(raw);
      if (seenT.has(em)) continue;
      seenT.add(em);
      if (!byEmail.has(em)) {
        byEmail.set(em, { email: em, label: em, subtitle: "Task assignee" });
      }
    }
  }

  const googleIds =
    !accRes.error && accRes.data
      ? accRes.data.filter((r) => r.provider === "google").map((r) => String(r.id))
      : [];
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let googleSearchOrder = googleIds;
  if (preferredGoogleId && uuidRe.test(preferredGoogleId) && googleIds.includes(preferredGoogleId)) {
    googleSearchOrder = [preferredGoogleId, ...googleIds.filter((id) => id !== preferredGoogleId)];
  }

  if (qRaw.length >= GOOGLE_OTHER_CONTACTS_MIN_QUERY && googleSearchOrder.length > 0) {
    const tryIds = googleSearchOrder.slice(0, 2);
    for (const accountId of tryIds) {
      try {
        const { accessToken } = await getValidGoogleAccessToken(supabase, user.id, accountId);
        const rows = await searchGoogleOtherContacts(accessToken, qRaw);
        for (const r of rows) {
          const em = normalizeEmail(r.email);
          if (!isEmail(em) || byEmail.has(em)) continue;
          const dn = r.displayName?.trim();
          const label = dn && !dn.includes("@") ? dn : em;
          byEmail.set(em, { email: em, label, subtitle: "Google contacts" });
        }
      } catch (e) {
        if (e instanceof GoogleIntegrationError) continue;
        if (e instanceof GooglePeopleSearchError) continue;
      }
    }
  }

  const list: FollowupRecipientSuggestion[] = [];
  for (const row of byEmail.values()) {
    if (!matchesQuery(q, row.email, row.label)) continue;
    list.push({ id: row.email, email: row.email, label: row.label, subtitle: row.subtitle });
  }

  list.sort((a, b) => {
    const ae = a.email.startsWith(q);
    const be = b.email.startsWith(q);
    if (ae !== be) return ae ? -1 : 1;
    const al = a.label.toLowerCase().startsWith(q);
    const bl = b.label.toLowerCase().startsWith(q);
    if (al !== bl) return al ? -1 : 1;
    const pr: Record<string, number> = {
      "Team member": 0,
      "Connected Google account": 1,
      "Connected Microsoft account": 1,
      "Connected email account": 1,
      "Connected account": 1,
      "Google contacts": 2,
      "Past follow-up": 3,
      "Task assignee": 4,
    };
    const pa = pr[a.subtitle] ?? 9;
    const pb = pr[b.subtitle] ?? 9;
    if (pa !== pb) return pa - pb;
    return a.label.localeCompare(b.label);
  });

  return NextResponse.json(
    { suggestions: list.slice(0, limit) },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
