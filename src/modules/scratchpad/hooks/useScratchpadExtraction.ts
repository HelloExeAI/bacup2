"use client";

import * as React from "react";
import type { Block } from "@/store/scratchpadStore";
import { useTaskStore, type Task } from "@/store/taskStore";

function coerceTaskSource(s: string | null): Task["source"] {
  return s === "manual" || s === "ai" || s === "scratchpad" ? s : "scratchpad";
}

export type SamClarification = {
  id: string;
  task_id: string;
  rewritten_title: string;
  missing_fields: Array<"recipient" | "due_date" | "due_time">;
  source_date: string | null;
};

function useDebounced(fn: () => void, ms: number) {
  const fnRef = React.useRef(fn);
  React.useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const tRef = React.useRef<number | null>(null);
  const schedule = React.useCallback(() => {
    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = window.setTimeout(() => fnRef.current(), ms);
  }, [ms]);
  const cancel = React.useCallback(() => {
    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = null;
  }, []);

  React.useEffect(() => cancel, [cancel]);
  return { schedule };
}

function buildExtractBlocks(blocks: Block[]) {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const depthMemo = new Map<string, number>();
  const getDepth = (id: string) => {
    if (depthMemo.has(id)) return depthMemo.get(id)!;
    const seen = new Set<string>();
    let depth = 0;
    let cur = byId.get(id);
    while (cur?.parent_id) {
      if (seen.has(cur.parent_id)) break;
      seen.add(cur.parent_id);
      const parent = byId.get(cur.parent_id);
      if (!parent) break;
      depth += 1;
      cur = parent;
    }
    depthMemo.set(id, depth);
    return depth;
  };
  return blocks
    .map((b) => ({ content: b.content.trim(), depth: getDepth(b.id) }))
    .filter((b) => b.content.length > 0);
}

export function useScratchpadExtraction({
  userId,
  selectedDate,
  blocksRef,
}: {
  userId: string | null;
  selectedDate: string;
  blocksRef: React.MutableRefObject<Block[]>;
}) {
  const addTasks = useTaskStore((s) => s.addTasks);
  const lastExtractSigRef = React.useRef("");
  const extractInFlightRef = React.useRef(false);
  const extractPendingRef = React.useRef(false);
  const extractionDisabledRef = React.useRef(false);
  const warnedInvalidKeyRef = React.useRef(false);
  const [clarifications, setClarifications] = React.useState<SamClarification[]>([]);

  const loadOpenClarifications = React.useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/sam/clarifications/open?date=${encodeURIComponent(selectedDate)}`);
      const j = await res.json().catch(() => null);
      if (!res.ok) return;
      setClarifications((j?.clarifications ?? []) as SamClarification[]);
    } catch {
      // no-op; extraction should remain resilient
    }
  }, [selectedDate, userId]);

  const extractNow = React.useCallback(async () => {
    if (!userId) return;
    if (extractionDisabledRef.current) return;
    if (extractInFlightRef.current) {
      extractPendingRef.current = true;
      return;
    }

    const extractBlocks = buildExtractBlocks(blocksRef.current);
    if (extractBlocks.length === 0) return;
    const sig = `${selectedDate}|${extractBlocks.map((b) => `${b.depth}:${b.content}`).join("\n")}`;
    if (sig === lastExtractSigRef.current) return;

    extractInFlightRef.current = true;
    try {
      const res = await fetch("/api/scratchpad/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: selectedDate, blocks: extractBlocks }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        const code = String(j?.code ?? "");
        if (res.status === 401 && code === "invalid_openai_api_key") {
          extractionDisabledRef.current = true;
          if (!warnedInvalidKeyRef.current) {
            warnedInvalidKeyRef.current = true;
            console.warn("[scratchpad] AI extraction disabled: invalid OPENAI_API_KEY");
          }
          return;
        }
        throw new Error(j?.error || `Extract failed (${res.status})`);
      }
      const tasks = (j?.tasks ?? []) as Array<{
        id: string;
        title: string;
        description: string | null;
        type: "todo" | "followup" | "reminder";
        due_date: string;
        due_time: string;
        assigned_to: string;
        status: "pending" | "done";
        completed_at: string | null;
        created_at: string;
        source: string | null;
      }>;
      if (tasks.length > 0 && userId) {
        addTasks(
          tasks.map((t) => ({
            ...t,
            user_id: userId,
            source: coerceTaskSource(t.source),
          })),
        );
      }
      setClarifications((j?.clarifications ?? []) as SamClarification[]);
      lastExtractSigRef.current = sig;
    } catch (e) {
      console.error("[scratchpad] extract failed", e);
    } finally {
      extractInFlightRef.current = false;
      if (extractPendingRef.current) {
        extractPendingRef.current = false;
        void extractNow();
      }
    }
  }, [addTasks, blocksRef, selectedDate, userId]);

  React.useEffect(() => {
    void loadOpenClarifications();
  }, [loadOpenClarifications]);

  const dismissClarification = React.useCallback(async (id: string) => {
    const res = await fetch(`/api/sam/clarifications/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    if (!res.ok) return false;
    setClarifications((prev) => prev.filter((c) => c.id !== id));
    return true;
  }, []);

  const resolveClarification = React.useCallback(
    async ({
      clarificationId,
      taskId,
      recipient,
      dueDate,
      dueTime,
    }: {
      clarificationId: string;
      taskId: string;
      recipient?: string;
      dueDate?: string;
      dueTime?: string;
    }) => {
      const patchBody: Record<string, unknown> = {};
      if (dueDate) patchBody.due_date = dueDate;
      if (dueTime) patchBody.due_time = dueTime;
      if (recipient) {
        patchBody.assigned_to = recipient;
        if (recipient.trim().toLowerCase() !== "self") {
          patchBody.type = "followup";
        }
      }

      const taskRes = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      const taskJson = await taskRes.json().catch(() => null);
      if (!taskRes.ok) return { ok: false as const, error: taskJson?.error || "Task update failed" };

      const clarRes = await fetch(`/api/sam/clarifications/${clarificationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      });
      if (!clarRes.ok) return { ok: false as const, error: "Clarification resolve failed" };

      const openRes = await fetch(`/api/sam/clarifications/open?date=${encodeURIComponent(selectedDate)}`);
      const openJson = await openRes.json().catch(() => null);
      if (openRes.ok) setClarifications((openJson?.clarifications ?? []) as SamClarification[]);
      if (taskJson?.task) addTasks([taskJson.task]);
      return { ok: true as const };
    },
    [addTasks, selectedDate],
  );

  const { schedule } = useDebounced(() => void extractNow(), 1400);
  return { scheduleExtract: schedule, clarifications, dismissClarification, resolveClarification };
}

