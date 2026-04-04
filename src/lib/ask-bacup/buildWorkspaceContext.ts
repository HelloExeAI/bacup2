import type { SupabaseClient } from "@supabase/supabase-js";

import { assembleBrainLayers, renderBrainMarkdown, addDaysYmd } from "@/lib/ask-bacup/brain";

function truncate(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Full Ask Bacup workspace snapshot:
 * 1) Operating brain (L0–L4): temporal anchor, contract, today + week calendars, tasks/recurrence.
 * 2) Supplementary: profile, prefs, integrations, scratchpad, pages, milestones, team.
 */
export async function buildWorkspaceContext(
  supabase: SupabaseClient,
  userId: string,
  opts?: { maxChars?: number },
): Promise<string> {
  const maxChars = opts?.maxChars ?? 24_000;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,name,timezone,location,role")
    .eq("id", userId)
    .maybeSingle();

  const tz = typeof profile?.timezone === "string" && profile.timezone.trim() ? profile.timezone.trim() : "UTC";

  const { chunks, week } = await assembleBrainLayers(supabase, userId, tz);
  const today = week.today;

  const sections: string[] = [];
  sections.push(renderBrainMarkdown(chunks));

  sections.push("\n## Supplementary — Profile");
  sections.push(
    [
      profile?.display_name || profile?.name ? `Name: ${profile?.display_name || profile?.name}` : null,
      `Timezone: ${tz}`,
      profile?.location ? `Location: ${profile.location}` : null,
      profile?.role ? `Role: ${profile.role}` : null,
    ]
      .filter(Boolean)
      .join("\n") || "(minimal profile)",
  );

  const { data: settings } = await supabase
    .from("user_settings")
    .select("assistant_tone,preferred_language,daily_briefing_style")
    .eq("user_id", userId)
    .maybeSingle();
  if (settings) {
    sections.push("\n## Supplementary — Preferences");
    sections.push(
      `Assistant tone: ${String(settings.assistant_tone ?? "balanced")}; language: ${String(settings.preferred_language ?? "en")}; briefing style: ${String(settings.daily_briefing_style ?? "standard")}.`,
    );
  }

  const { data: accounts } = await supabase
    .from("user_connected_accounts")
    .select("provider,account_email")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(12);
  if (accounts?.length) {
    sections.push("\n## Supplementary — Connected accounts");
    sections.push(accounts.map((a) => `- ${a.provider}: ${a.account_email}`).join("\n"));
  }

  for (const offset of [0, -1, 1]) {
    const ymd = addDaysYmd(today, offset);
    const { data: blocks } = await supabase
      .from("blocks")
      .select("content,order_index")
      .eq("user_id", userId)
      .eq("date", ymd)
      .order("order_index", { ascending: true })
      .limit(40);
    if (blocks?.length) {
      sections.push(`\n## Supplementary — Scratchpad bullets (${ymd})`);
      sections.push(
        blocks
          .map((b) => `- ${truncate(String(b.content ?? "").replace(/\s+/g, " "), 400)}`)
          .join("\n"),
      );
    }
  }

  const { data: pages } = await supabase
    .from("pages")
    .select("title,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(12);
  if (pages?.length) {
    sections.push("\n## Supplementary — Scratchpad pages (titles)");
    sections.push(pages.map((p) => `- ${truncate(String(p.title), 120)}`).join("\n"));
  }

  const { data: milestones } = await supabase
    .from("user_milestones")
    .select("title,kind,month,day,notes")
    .eq("user_id", userId)
    .order("month", { ascending: true })
    .order("day", { ascending: true })
    .limit(24);

  if (milestones?.length) {
    sections.push("\n## Supplementary — Milestones");
    sections.push(
      milestones
        .map((m) => {
          const note = m.notes ? truncate(String(m.notes), 120) : "";
          return `- ${m.kind} ${String(m.month).padStart(2, "0")}-${String(m.day).padStart(2, "0")}: ${truncate(String(m.title), 100)}${note ? ` — ${note}` : ""}`;
        })
        .join("\n"),
    );
  }

  const { data: team } = await supabase
    .from("team_members")
    .select("display_name,status")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true })
    .limit(20);
  if (team?.length) {
    sections.push("\n## Supplementary — Team collaborators (you as owner)");
    sections.push(team.map((m) => `- ${m.display_name || "Member"} (${m.status})`).join("\n"));
  }

  let body = sections.join("\n");
  if (body.length > maxChars) {
    body = `${truncate(body, maxChars)}\n\n[Context truncated for length.]`;
  }
  return body;
}
