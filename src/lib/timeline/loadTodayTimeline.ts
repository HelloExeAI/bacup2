import type { SupabaseClient } from "@supabase/supabase-js";

import { localDayBoundsIso } from "@/lib/datetime/localDayBounds";
import { getValidGoogleAccessToken, GoogleIntegrationError } from "@/lib/integrations/google/googleAccessToken";
import { getValidMicrosoftAccessToken, MicrosoftIntegrationError } from "@/lib/integrations/microsoft/microsoftAccessToken";
import { fetchGoogleTimelineEvents } from "@/lib/timeline/googleCalendarFetch";
import { fetchMicrosoftTimelineEvents } from "@/lib/timeline/microsoftCalendarFetch";
import { getDecryptedImapSession } from "@/lib/integrations/imap/imapConfig";
import { fetchCalDavEventsForSession } from "@/lib/integrations/imap/caldavEvents";
import { eventLocalYmd } from "@/lib/timeline/eventLocalYmd";
import { timelineSortKey } from "@/lib/timeline/sortTimestamp";
import type { TimelineItem, TimelineTodayResult } from "@/lib/timeline/types";
import type { Task } from "@/store/taskStore";
import { taskDueDateTime } from "@/lib/tasks/taskOverdue";

function ymdToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const TASK_BLOCK_MS = 15 * 60 * 1000;

export async function loadTodayTimeline(
  supabase: SupabaseClient,
  userId: string,
): Promise<TimelineTodayResult> {
  const day = ymdToday();
  const { timeMin, timeMax } = localDayBoundsIso(day);

  const items: TimelineItem[] = [];
  let googleConnected = false;
  let outlookConnected = false;
  let imapConnected = false;

  const { data: googleAccountRows, error: googleListErr } = await supabase
    .from("user_connected_accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "google")
    .order("created_at", { ascending: true });

  if (!googleListErr && googleAccountRows?.length) {
    googleConnected = true;
    for (const acc of googleAccountRows as { id: string }[]) {
      try {
        const { accessToken } = await getValidGoogleAccessToken(supabase, userId, acc.id);
        const raw = await fetchGoogleTimelineEvents(accessToken, timeMin, timeMax, 80);
        for (const ev of raw) {
          if (eventLocalYmd(ev.start) !== day) continue;
          items.push({
            key: `google:${acc.id}:${ev.id}:${ev.start ?? ""}`,
            source: "google",
            title: ev.summary,
            start: ev.start,
            end: ev.end,
            htmlLink: ev.htmlLink,
            attendees: ev.attendees,
            description: ev.description,
            location: ev.location,
            timeZone: ev.timeZone,
            meetingLinks: ev.meetingLinks,
          });
        }
      } catch (e) {
        if (!(e instanceof GoogleIntegrationError && e.code === "not_connected")) {
          console.warn("[timeline] google account", acc.id, e);
        }
      }
    }
  }

  const { data: msAccountRows, error: msListErr } = await supabase
    .from("user_connected_accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "microsoft")
    .order("created_at", { ascending: true });

  if (!msListErr && msAccountRows?.length) {
    outlookConnected = true;
    for (const acc of msAccountRows as { id: string }[]) {
      try {
        const { accessToken } = await getValidMicrosoftAccessToken(supabase, userId, acc.id);
        const raw = await fetchMicrosoftTimelineEvents(accessToken, timeMin, timeMax);
        for (const ev of raw) {
          if (eventLocalYmd(ev.start) !== day) continue;
          items.push({
            key: `outlook:${acc.id}:${ev.id}:${ev.start ?? ""}`,
            source: "outlook",
            title: ev.summary,
            start: ev.start,
            end: ev.end,
            htmlLink: ev.htmlLink,
            attendees: ev.attendees,
            description: ev.description,
            location: ev.location,
            timeZone: ev.timeZone,
            meetingLinks: ev.meetingLinks,
          });
        }
      } catch (e) {
        if (!(e instanceof MicrosoftIntegrationError && e.code === "not_connected")) {
          console.warn("[timeline] outlook account", acc.id, e);
        }
      }
    }
  }

  const { data: imapAccountRows, error: imapListErr } = await supabase
    .from("user_connected_accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "imap")
    .order("created_at", { ascending: true });

  if (!imapListErr && imapAccountRows?.length) {
    imapConnected = true;
    for (const acc of imapAccountRows as { id: string }[]) {
      try {
        const session = await getDecryptedImapSession(supabase, userId, acc.id);
        if (!session.caldavUrl?.trim()) continue;
        const raw = await fetchCalDavEventsForSession(session, timeMin, timeMax);
        for (const ev of raw) {
          if (eventLocalYmd(ev.start) !== day) continue;
          items.push({
            key: `imap:${acc.id}:${ev.id}:${ev.start ?? ""}`,
            source: "imap",
            title: ev.summary,
            start: ev.start,
            end: ev.end,
            htmlLink: ev.htmlLink,
            attendees: [],
            description: null,
            location: ev.location,
            timeZone: null,
            meetingLinks: [],
          });
        }
      } catch (e) {
        console.warn("[timeline] imap account", acc.id, e);
      }
    }
  }

  const { data: taskRows, error: taskErr } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("due_date", day)
    .eq("status", "pending")
    .in("type", ["todo", "followup", "reminder"]);

  if (!taskErr && Array.isArray(taskRows)) {
    for (const t of taskRows as Task[]) {
      const startDt = taskDueDateTime(t);
      const endDt = new Date(startDt.getTime() + TASK_BLOCK_MS);
      items.push({
        key: `task:${t.id}`,
        source: "task",
        title: t.type === "followup" ? `Follow-up: ${t.title}` : t.title,
        start: startDt.toISOString(),
        end: endDt.toISOString(),
        htmlLink: null,
        attendees: [],
        taskId: t.id,
        taskType: t.type,
        description: t.description ?? null,
      });
    }
  }

  const { data: milestoneRows, error: msErr } = await supabase
    .from("user_milestones")
    .select("id,title,kind,month,day")
    .eq("user_id", userId);

  if (!msErr && Array.isArray(milestoneRows)) {
    const now = new Date();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    for (const row of milestoneRows as { id: string; title: string; kind: string; month: number; day: number }[]) {
      if (row.month !== m || row.day !== d) continue;
      const label =
        row.kind === "birthday"
          ? `Birthday — ${row.title}`
          : row.kind === "anniversary"
            ? `Anniversary — ${row.title}`
            : row.title;
      items.push({
        key: `milestone:${row.id}`,
        source: "milestone",
        title: label,
        start: day,
        end: day,
        htmlLink: null,
        attendees: [],
        milestoneKind: row.kind,
        description: null,
      });
    }
  }

  items.sort((a, b) => timelineSortKey(a.start) - timelineSortKey(b.start));

  return {
    items,
    connected: { google: googleConnected, outlook: outlookConnected, imap: imapConnected },
  };
}
