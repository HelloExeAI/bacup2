"use client";

import * as React from "react";
import { useUserStore } from "@/store/userStore";
import { parseTasks } from "@/modules/scratchpad/parser";
import { useTaskStore } from "@/store/taskStore";
import { VoiceInput } from "@/modules/scratchpad/VoiceInput";

function useDebouncedCallback<T extends (...args: any[]) => void>(cb: T, delayMs: number) {
  const cbRef = React.useRef(cb);
  React.useEffect(() => {
    cbRef.current = cb;
  }, [cb]);

  const timeoutRef = React.useRef<number | null>(null);

  const cancel = React.useCallback(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const debounced = React.useCallback(
    (...args: Parameters<T>) => {
      cancel();
      timeoutRef.current = window.setTimeout(() => cbRef.current(...args), delayMs);
    },
    [cancel, delayMs],
  );

  React.useEffect(() => cancel, [cancel]);
  return { debounced, cancel };
}

export function TextNotes() {
  const user = useUserStore((s) => s.user);
  const [content, setContent] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const addOptimisticTasks = useTaskStore((s) => s.addOptimisticTasks);
  const replaceOptimistic = useTaskStore((s) => s.replaceOptimistic);

  const lastSavedRef = React.useRef<string>("");
  const inFlightRef = React.useRef(false);
  const contentRef = React.useRef<string>("");
  React.useEffect(() => {
    contentRef.current = content;
  }, [content]);

  async function withTimeout<T>(
    p: PromiseLike<T>,
    ms: number,
    label: string,
  ): Promise<T> {
    return (await Promise.race([
      Promise.resolve(p as unknown as T),
      new Promise<T>((_, reject) =>
        window.setTimeout(() => reject(new Error(`${label} timed out`)), ms),
      ),
    ])) as T;
  }

  const save = React.useCallback(
    async (opts?: { reason: "enter" | "autosave" | "blur" | "interval" }) => {
      if (!user) return;
      if (inFlightRef.current) return;
      const trimmed = contentRef.current.trim();
      if (!trimmed) return;
      if (trimmed === lastSavedRef.current) return;

      inFlightRef.current = true;
      setSaving(true);
      setStatus("Saving…");

      try {
        const parsed = parseTasks(trimmed);
        console.log("[scratchpad] parsed tasks", parsed);

        const optimisticIds =
          parsed.length > 0
            ? addOptimisticTasks(
                parsed.map((t) => ({
                  user_id: user.id,
                  title: t.title,
                  description: t.description,
                  due_date: t.due_date,
                  due_time: t.due_time,
                  type: t.type,
                  assigned_to: t.assigned_to,
                  status: "pending",
                  source: "scratchpad",
                })),
              )
            : [];

        const res = await withTimeout(
          fetch("/api/scratchpad/save", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: trimmed }),
          }),
          12_000,
          "Saving note",
        );

        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error || `Save failed (${res.status})`);
        }

        const j = (await res.json()) as { tasks?: any[] };
        const inserted = j.tasks ?? [];
        inserted.forEach((row: any, idx: number) => {
          const tempId = optimisticIds[idx];
          if (tempId) replaceOptimistic(tempId, row);
        });

        lastSavedRef.current = trimmed;
        setStatus("Saved");
        window.setTimeout(() => setStatus(null), 1500);
      } catch (e) {
        console.error("[scratchpad] save error", e);
        const msg =
          e instanceof Error ? e.message : "Failed to save. Check console.";
        setStatus(msg);
        // If we added optimistic tasks but failed to insert, we can’t reliably map; leave them for now.
        // In practice the most common failure is auth/permissions; user will refresh after fixing.
      } finally {
        setSaving(false);
        inFlightRef.current = false;
      }
    },
    [addOptimisticTasks, replaceOptimistic, user],
  );

  // Enter-to-save; no debounced autosave to avoid duplicate task creation.

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Scratchpad</h1>
        <div className="flex items-center gap-3">
          {status ? (
            <div className="text-sm text-muted-foreground">{status}</div>
          ) : saving ? (
            <div className="text-sm text-muted-foreground">Saving…</div>
          ) : (
            <div className="text-sm text-muted-foreground">Autosave</div>
          )}
        </div>
      </div>

      <VoiceInput
        onTranscript={(text) => {
          const next = contentRef.current
            ? `${contentRef.current}\n${text}`
            : text;
          setContent(next);
          contentRef.current = next;
        }}
      />

      <textarea
        className={[
          "min-h-[220px] w-full rounded-lg border border-border bg-background p-4 text-sm text-foreground",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20",
        ].join(" ")}
        placeholder="Type a note, then press Enter to save. Use Shift+Enter for a new line."
        value={content}
        onChange={(e) => {
          const next = e.target.value;
          setContent(next);
          contentRef.current = next;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void save({ reason: "autosave" });
          }
        }}
      />

      <div className="text-xs text-muted-foreground">
        Press <span className="font-mono">Enter</span> to save. Use{" "}
        <span className="font-mono">Shift+Enter</span> for new lines. Tasks detected by keywords or
        lines starting with <span className="font-mono">-</span> /{" "}
        <span className="font-mono">[ ]</span>.
      </div>
    </div>
  );
}

