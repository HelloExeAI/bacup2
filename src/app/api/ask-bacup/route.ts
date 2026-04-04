import { NextResponse } from "next/server";
import { z } from "zod";

import { buildWorkspaceContext } from "@/lib/ask-bacup/buildWorkspaceContext";
import { buildAskBacupSystemPrompt } from "@/lib/ask-bacup/systemPrompt";
import { requireAskBacupAccess } from "@/lib/ask-bacup/entitlement";
import {
  fetchWebHitsForAskBacup,
  formatWebHitsForPrompt,
  getAskBacupSearchCredentials,
  planAskBacupWebResearch,
} from "@/lib/ask-bacup/webSearch";
import { assertOpenAIQuotaAvailable, recordOpenAITokenUsage } from "@/lib/billing/aiQuota";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserSettingsRow } from "@/modules/settings/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PostSchema = z.object({
  message: z.string().min(1).max(32_000),
  threadId: z.string().uuid().optional().nullable(),
});

async function getOrCreateThread(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  const { data: existing } = await supabase
    .from("ask_bacup_threads")
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: ins, error } = await supabase
    .from("ask_bacup_threads")
    .insert({ user_id: userId, title: "Chat" })
    .select("id")
    .single();

  if (error || !ins?.id) {
    throw new Error(error?.message || "Failed to create thread");
  }
  return ins.id as string;
}

async function resolveThreadForPost(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  requested: string | null | undefined,
): Promise<string> {
  if (requested && /^[0-9a-f-]{36}$/i.test(requested)) {
    const { data: row } = await supabase
      .from("ask_bacup_threads")
      .select("id")
      .eq("user_id", userId)
      .eq("id", requested)
      .maybeSingle();
    if (row?.id) return row.id as string;
    throw new Error("THREAD_NOT_FOUND");
  }
  return getOrCreateThread(supabase, userId);
}

/** Bootstrap thread + messages. Use `?threadId=<uuid>` to open a past conversation; omit for latest. */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const gate = await requireAskBacupAccess(supabase);
  if ("response" in gate) return gate.response;

  const url = new URL(req.url);
  const requestedThread = url.searchParams.get("threadId")?.trim();

  try {
    let threadId: string;
    if (requestedThread && /^[0-9a-f-]{36}$/i.test(requestedThread)) {
      const { data: row } = await supabase
        .from("ask_bacup_threads")
        .select("id")
        .eq("user_id", gate.userId)
        .eq("id", requestedThread)
        .maybeSingle();
      if (!row?.id) {
        return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      }
      threadId = row.id as string;
    } else {
      threadId = await getOrCreateThread(supabase, gate.userId);
    }

    const { data: msgs } = await supabase
      .from("ask_bacup_messages")
      .select("id,role,content,created_at")
      .eq("thread_id", threadId)
      .eq("user_id", gate.userId)
      .order("created_at", { ascending: true })
      .limit(100);

    return NextResponse.json({
      threadId,
      messages: (msgs ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ask-bacup GET]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const gate = await requireAskBacupAccess(supabase);
  if ("response" in gate) return gate.response;
  const userId = gate.userId;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const json = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const model = process.env.ASK_BACUP_MODEL?.trim() || "gpt-4o-mini";
  const message = parsed.data.message.trim();

  let threadId: string;
  try {
    threadId = await resolveThreadForPost(supabase, userId, parsed.data.threadId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "THREAD_NOT_FOUND") {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { data: settingsRow } = await supabase
    .from("user_settings")
    .select("assistant_tone")
    .eq("user_id", userId)
    .maybeSingle();

  const assistantTone: UserSettingsRow["assistant_tone"] =
    settingsRow?.assistant_tone === "direct" || settingsRow?.assistant_tone === "detailed"
      ? settingsRow.assistant_tone
      : "balanced";

  let workspaceContext: string;
  try {
    workspaceContext = await buildWorkspaceContext(supabase, userId);
  } catch (e) {
    console.error("[ask-bacup] buildWorkspaceContext", e);
    workspaceContext = "(Workspace snapshot unavailable.)";
  }

  const searchCreds = getAskBacupSearchCredentials();
  const estTokens = Math.min(
    120_000,
    Math.ceil((workspaceContext.length + message.length) / 3) +
      6000 +
      (searchCreds ? 5500 : 0),
  );
  const quota = await assertOpenAIQuotaAvailable(supabase, userId, estTokens);
  if (!quota.ok) {
    return NextResponse.json(
      {
        error: "AI quota exceeded for this month. Open Settings → Plans to review limits or add packs.",
        code: "quota_exceeded",
        kind: "openai",
      },
      { status: 402 },
    );
  }

  let webFindingsFormatted = "";
  let routerOpenAITokens = 0;
  if (searchCreds) {
    const plan = await planAskBacupWebResearch({
      userMessage: message,
      openaiApiKey: apiKey,
      model: "gpt-4o-mini",
    });
    routerOpenAITokens = plan.routerPromptTokens + plan.routerCompletionTokens;
    if (plan.shouldSearch) {
      const hits = await fetchWebHitsForAskBacup(searchCreds, plan.queries, message);
      webFindingsFormatted = formatWebHitsForPrompt(hits);
    }
  }

  const systemContent = buildAskBacupSystemPrompt({
    workspaceContext,
    assistantTone,
    ...(webFindingsFormatted ? { webFindings: webFindingsFormatted } : {}),
  });

  const { error: insUserErr } = await supabase.from("ask_bacup_messages").insert({
    thread_id: threadId,
    user_id: userId,
    role: "user",
    content: message,
  });
  if (insUserErr) {
    console.error("[ask-bacup] insert user message", insUserErr);
    return NextResponse.json({ error: insUserErr.message }, { status: 500 });
  }

  const { count: msgCount } = await supabase
    .from("ask_bacup_messages")
    .select("*", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .eq("user_id", userId);
  if (typeof msgCount === "number" && msgCount === 1) {
    const title = message.replace(/\s+/g, " ").trim().slice(0, 72) || "Chat";
    await supabase.from("ask_bacup_threads").update({ title }).eq("id", threadId).eq("user_id", userId);
  }

  const { data: history } = await supabase
    .from("ask_bacup_messages")
    .select("role,content")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(24);

  const openaiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemContent },
    ...((history ?? [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        const c = m.content.length > 6000 ? `${m.content.slice(0, 5999).trimEnd()}…` : m.content;
        return {
          role: m.role as "user" | "assistant",
          content: c,
        };
      }) as { role: "user" | "assistant"; content: string }[]),
  ];

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.45,
      max_tokens: 4096,
      messages: openaiMessages,
    }),
  });

  if (!openaiRes.ok) {
    const errBody = await openaiRes.json().catch(() => null);
    const errMsg =
      typeof (errBody as { error?: { message?: string } })?.error?.message === "string"
        ? (errBody as { error: { message: string } }).error.message
        : "OpenAI request failed";
    return NextResponse.json({ error: errMsg }, { status: 502 });
  }

  if (!openaiRes.body) {
    return NextResponse.json({ error: "Empty OpenAI stream" }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      type UsageChunk = { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
      let totalUsage: UsageChunk | null = null;
      const writeJson = (obj: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };

      try {
        writeJson({ type: "thread", threadId });
        const reader = openaiRes.body!.getReader();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n");
          buffer = parts.pop() ?? "";
          for (const line of parts) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") continue;
            let chunk: unknown;
            try {
              chunk = JSON.parse(data) as {
                choices?: { delta?: { content?: string } }[];
                usage?: UsageChunk;
              };
            } catch {
              continue;
            }
            const usageFromChunk = (chunk as { usage?: UsageChunk }).usage;
            if (usageFromChunk && (usageFromChunk.total_tokens != null || usageFromChunk.prompt_tokens != null)) {
              totalUsage = usageFromChunk;
            }
            const piece = (chunk as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content;
            if (piece) {
              full += piece;
              writeJson({ type: "token", v: piece });
            }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        writeJson({ type: "error", message: msg });
      } finally {
        const trimmed = full.trim();
        if (trimmed.length > 0) {
          const { error: insAsstErr } = await supabase.from("ask_bacup_messages").insert({
            thread_id: threadId,
            user_id: userId,
            role: "assistant",
            content: trimmed,
          });
          if (insAsstErr) {
            console.error("[ask-bacup] insert assistant", insAsstErr);
          }
        }
        await supabase
          .from("ask_bacup_threads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", threadId)
          .eq("user_id", userId);

        const streamTotal =
          totalUsage && typeof totalUsage.total_tokens === "number"
            ? totalUsage.total_tokens
            : typeof totalUsage?.prompt_tokens === "number" || typeof totalUsage?.completion_tokens === "number"
              ? (totalUsage?.prompt_tokens ?? 0) + (totalUsage?.completion_tokens ?? 0)
              : 0;
        const billable = streamTotal + routerOpenAITokens;
        if (billable > 0) {
          const rec = await recordOpenAITokenUsage(supabase, userId, billable);
          if (!rec.ok) {
            console.warn("[ask-bacup] recordOpenAITokenUsage", rec.error);
          }
        }

        writeJson({ type: "done" });
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
