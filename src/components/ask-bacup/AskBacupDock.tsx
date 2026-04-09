"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { formatAskBacupAssistantDisplay } from "@/lib/ask-bacup/formatAssistantDisplay";
import { FETCH_DISPOSED, isAbortError } from "@/lib/fetch/dispose";
import { VoiceInput } from "@/modules/scratchpad/VoiceInput";
import { useAskBacupStore } from "@/store/askBacupStore";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

type ThreadRow = { id: string; title: string; created_at: string; updated_at: string };

const PRESETS = [
  { label: "Today's priorities", text: "Using my live Bacup data, what should I do first today and why?" },
  { label: "Week snapshot", text: "Summarize my workload and commitments for the next 7 days from Bacup." },
  { label: "Overdue & risk", text: "What is overdue or at risk in my tasks and calendar? Give next actions." },
  { label: "Team update draft", text: "Draft a short professional team update using only what you see in Bacup." },
];

function newLocalId() {
  return globalThis.crypto?.randomUUID?.() ?? `m-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function AskBacupDock() {
  const open = useAskBacupStore((s) => s.open);
  const setOpen = useAskBacupStore((s) => s.setOpen);
  const draftMessage = useAskBacupStore((s) => s.draftMessage);
  const setDraftMessage = useAskBacupStore((s) => s.setDraftMessage);

  const [threadId, setThreadId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [streaming, setStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [threads, setThreads] = React.useState<ThreadRow[]>([]);
  const [threadsLoading, setThreadsLoading] = React.useState(false);
  const [newChatBusy, setNewChatBusy] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const streamAbortRef = React.useRef<AbortController | null>(null);

  const loadThreads = React.useCallback(async () => {
    setThreadsLoading(true);
    try {
      const res = await fetch("/api/ask-bacup/threads", { cache: "no-store", credentials: "include" });
      const j = await res.json().catch(() => null);
      if (res.ok && Array.isArray(j?.threads)) setThreads(j.threads as ThreadRow[]);
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  const bootstrap = React.useCallback(
    async (opts?: { whenCancelled?: () => boolean; signal?: AbortSignal; threadId?: string | null }) => {
    const gone = () => Boolean(opts?.signal?.aborted) || Boolean(opts?.whenCancelled?.());
    setError(null);
    try {
      const init: RequestInit = { method: "GET", credentials: "include" };
      if (opts?.signal) init.signal = opts.signal;
      const q =
        opts?.threadId && /^[0-9a-f-]{36}$/i.test(opts.threadId)
          ? `?threadId=${encodeURIComponent(opts.threadId)}`
          : "";
      const res = await fetch(`/api/ask-bacup${q}`, init);
      if (gone()) return;
      const j = await res.json().catch(() => null);
      if (gone()) return;
      if (!res.ok) {
        setError(j?.error || `Could not load Ask Bacup (${res.status})`);
        return;
      }
      setThreadId(typeof j?.threadId === "string" ? j.threadId : null);
      const raw = Array.isArray(j?.messages) ? j.messages : [];
      setMessages(
        raw.map((m: { id?: string; role?: string; content?: string }) => ({
          id: String(m.id ?? newLocalId()),
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content ?? ""),
        })),
      );
    } catch (e) {
      if (gone()) return;
      if (isAbortError(e)) return;
      setError(e instanceof Error ? e.message : "Could not load Ask Bacup");
    }
  },
    [],
  );

  const startNewChat = React.useCallback(async () => {
    if (streaming || newChatBusy) return;
    streamAbortRef.current?.abort(FETCH_DISPOSED);
    streamAbortRef.current = null;
    setNewChatBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ask-bacup/thread", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof j?.error === "string" ? j.error : "Could not start a new chat");
        return;
      }
      const id = typeof j?.threadId === "string" ? j.threadId : null;
      if (!id) {
        setError("Invalid server response");
        return;
      }
      setThreadId(id);
      setMessages([]);
      setHistoryOpen(false);
      void loadThreads();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start a new chat");
    } finally {
      setNewChatBusy(false);
    }
  }, [streaming, newChatBusy, loadThreads]);

  const openThreadFromHistory = React.useCallback(
    async (id: string) => {
      if (streaming || id === threadId) {
        setHistoryOpen(false);
        return;
      }
      streamAbortRef.current?.abort(FETCH_DISPOSED);
      streamAbortRef.current = null;
      setError(null);
      await bootstrap({ threadId: id });
      setHistoryOpen(false);
      void loadThreads();
    },
    [streaming, threadId, bootstrap, loadThreads],
  );

  React.useEffect(() => {
    if (!open) {
      streamAbortRef.current?.abort(FETCH_DISPOSED);
      streamAbortRef.current = null;
      setHistoryOpen(false);
      return;
    }
    let cancelled = false;
    void bootstrap({ whenCancelled: () => cancelled });
    void loadThreads();
    return () => {
      cancelled = true;
    };
  }, [open, bootstrap, loadThreads]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  React.useEffect(() => {
    if (!open || !draftMessage) return;
    setInput(draftMessage);
    setDraftMessage(null);
  }, [open, draftMessage, setDraftMessage]);

  React.useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  React.useEffect(() => {
    return () => {
      streamAbortRef.current?.abort(FETCH_DISPOSED);
    };
  }, []);

  const removeEmptyAssistant = React.useCallback((assistantId: string) => {
    setMessages((m) => {
      const row = m.find((x) => x.id === assistantId);
      if (row && !row.content.trim()) return m.filter((x) => x.id !== assistantId);
      return m;
    });
  }, []);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading || streaming) return;

    setError(null);
    setLoading(true);
    const userMsg: ChatMessage = { id: newLocalId(), role: "user", content: trimmed };
    setMessages((m) => [...m, userMsg]);
    setInput("");

    const assistantId = newLocalId();
    setMessages((m) => [...m, { id: assistantId, role: "assistant", content: "" }]);
    setStreaming(true);
    setLoading(false);

    streamAbortRef.current?.abort(FETCH_DISPOSED);
    const ac = new AbortController();
    streamAbortRef.current = ac;

    try {
      const res = await fetch("/api/ask-bacup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, threadId }),
        signal: ac.signal,
      });

      if (ac.signal.aborted) {
        removeEmptyAssistant(assistantId);
        return;
      }

      if (res.status === 402) {
        const j = await res.json().catch(() => null);
        setError(j?.error || "AI or voice quota exceeded. Check Settings → Plans.");
        setMessages((m) => m.filter((x) => x.id !== assistantId));
        setStreaming(false);
        return;
      }

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error || `Ask Bacup failed (${res.status})`);
        setMessages((m) => m.filter((x) => x.id !== assistantId));
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError("No response stream.");
        setMessages((m) => m.filter((x) => x.id !== assistantId));
        setStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (err) {
          if (isAbortError(err)) break;
          throw err;
        }
        if (chunk.done) break;
        if (ac.signal.aborted) break;
        buf += decoder.decode(chunk.value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const s = line.trim();
          if (!s) continue;
          let ev: { type?: string; threadId?: string; v?: string; message?: string };
          try {
            ev = JSON.parse(s) as typeof ev;
          } catch {
            continue;
          }
          if (ev.type === "thread" && typeof ev.threadId === "string") {
            setThreadId(ev.threadId);
          }
          if (ev.type === "token" && typeof ev.v === "string") {
            setMessages((m) =>
              m.map((x) => (x.id === assistantId ? { ...x, content: x.content + ev.v } : x)),
            );
          }
          if (ev.type === "error" && ev.message) {
            setError(ev.message);
          }
        }
      }
      if (ac.signal.aborted) {
        removeEmptyAssistant(assistantId);
      }
    } catch (e) {
      if (isAbortError(e)) {
        removeEmptyAssistant(assistantId);
        return;
      }
      setError(e instanceof Error ? e.message : "Network error");
      setMessages((m) => m.filter((x) => x.id !== assistantId));
    } finally {
      if (streamAbortRef.current === ac) streamAbortRef.current = null;
      setStreaming(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-label="Ask Bacup">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label="Close Ask Bacup"
        onClick={() => setOpen(false)}
      />
      <div className="relative flex max-h-[min(720px,92vh)] w-full max-w-[min(90rem,calc(100vw-2rem))] flex-col rounded-t-2xl border border-border bg-background shadow-[0_-12px_48px_rgba(0,0,0,0.18)] dark:shadow-[0_-12px_56px_rgba(0,0,0,0.55)] sm:max-h-[min(820px,92vh)] sm:rounded-2xl">
        {historyOpen ? (
          <div
            className="absolute inset-y-0 left-0 z-20 flex w-[min(100%,280px)] flex-col border-r border-border bg-background shadow-lg"
            role="navigation"
            aria-label="Conversation history"
          >
            <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
              <span className="text-xs font-semibold">History</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setHistoryOpen(false)}>
                Done
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {threadsLoading ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">Loading…</p>
              ) : threads.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">No saved chats yet.</p>
              ) : (
                <ul className="space-y-1">
                  {threads.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        disabled={streaming}
                        onClick={() => void openThreadFromHistory(t.id)}
                        className={[
                          "w-full rounded-lg px-2 py-2 text-left text-xs transition-colors",
                          t.id === threadId
                            ? "bg-muted font-medium text-foreground"
                            : "text-foreground hover:bg-muted/60",
                          streaming ? "opacity-50" : "",
                        ].join(" ")}
                      >
                        <div className="line-clamp-2">{t.title || "Chat"}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {new Date(t.updated_at).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="border-t border-border/70 px-3 py-2 text-[10px] text-muted-foreground">
              All messages are saved per thread. Use New chat for a blank conversation.
            </p>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
          <div>
            <div className="text-sm font-semibold tracking-wide">Ask Bacup</div>
            <div className="text-[11px] text-muted-foreground">Live workspace data + general answers</div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={streaming}
              onClick={() => {
                setHistoryOpen((v) => !v);
                if (!historyOpen) void loadThreads();
              }}
            >
              History
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground">
              Ask anything — Bacup injects your tasks, calendar, scratchpad, and profile when relevant. Chats are saved;
              open <strong className="font-medium">History</strong> to revisit older threads.
            </p>
          ) : null}
          {messages.map((m) => (
            <div
              key={m.id}
              className={[
                "rounded-xl px-3 py-2 text-sm leading-relaxed",
                m.role === "user"
                  ? "ml-6 bg-muted/80 text-foreground"
                  : "mr-4 border border-border/60 bg-background/80 text-foreground",
              ].join(" ")}
            >
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {m.role === "user" ? "You" : "Bacup"}
              </div>
              <div className="whitespace-pre-wrap">
                {m.role === "assistant"
                  ? formatAskBacupAssistantDisplay(m.content) || (streaming ? "…" : "")
                  : m.content}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border/70 px-3 py-2">
          <div className="flex flex-wrap gap-1.5 pb-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={loading || streaming}
                onClick={() => void sendMessage(p.text)}
                className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/70 disabled:opacity-45"
              >
                {p.label}
              </button>
            ))}
          </div>
          {error ? <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex items-end gap-2">
            <textarea
              className="min-h-[4.5rem] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-ring/40 focus-visible:ring-2"
              placeholder="Message Ask Bacup…"
              value={input}
              disabled={loading || streaming}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage(input);
                }
              }}
            />
            <div className="flex shrink-0 items-end pb-1">
              <VoiceInput
                compact
                showCompactListeningLabel
                saveTranscriptToTasks={false}
                onTranscriptChange={(full) => setInput(full)}
              />
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={streaming || newChatBusy}
              onClick={() => void startNewChat()}
            >
              {newChatBusy ? "Starting…" : "New chat"}
            </Button>
            <Button type="button" size="sm" disabled={loading || streaming || !input.trim()} onClick={() => void sendMessage(input)}>
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
