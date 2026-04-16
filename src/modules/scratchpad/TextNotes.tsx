"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useUserStore } from "@/store/userStore";
import { useScratchpadStore, type Block } from "@/store/scratchpadStore";
import { ScratchpadRow } from "@/modules/scratchpad/components/ScratchpadRow";
import { SamClarificationModal } from "@/modules/scratchpad/components/SamClarificationModal";
import { useScratchpadExtraction } from "@/modules/scratchpad/hooks/useScratchpadExtraction";
import {
  buildChildrenByParent,
  buildVisibleRows,
  sortBlocks,
} from "@/modules/scratchpad/utils/blockTree";
import { VoiceInput } from "@/modules/scratchpad/VoiceInput";
import { GmailComposeWorkspace } from "@/modules/google/GmailComposeWorkspace";
import { GmailThreadWorkspace } from "@/modules/google/GmailThreadWorkspace";
import { MeetingsNotes } from "@/modules/scratchpad/MeetingsNotes";

/** Client-only: avoids SSR/client class drift and hydration mismatches for async mail UI. */
const ScratchpadGmailStrip = dynamic(
  () => import("@/modules/google/ScratchpadGmailStrip").then((m) => m.ScratchpadGmailStrip),
  { ssr: false, loading: () => null },
);

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
  return { schedule, cancel };
}

export function TextNotes() {
  const user = useUserStore((s) => s.user);
  const selectedDate = useScratchpadStore((s) => s.selectedDate);
  const setSelectedDate = useScratchpadStore((s) => s.setSelectedDate);
  const gmailThreadOpen = useScratchpadStore((s) => s.gmailThreadOpen);
  const gmailComposeOpen = useScratchpadStore((s) => s.gmailComposeOpen);
  const closeGmailPanel = useScratchpadStore((s) => s.closeGmailPanel);
  const [blocks, setBlocks] = React.useState<Block[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const lastSelectedIdRef = React.useRef<string | null>(null);
  const isSelectingRef = React.useRef(false);
  const dragCurrentIdRef = React.useRef<string | null>(null);

  const blocksRef = React.useRef<Block[]>([]);
  React.useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const inFlightRef = React.useRef(false);
  const pendingRef = React.useRef(false);
  const dirtyRef = React.useRef(false);

  const inputRefs = React.useRef<Record<string, HTMLTextAreaElement | null>>({});
  const activeBlockIdRef = React.useRef<string | null>(null);
  const loadSeqRef = React.useRef(0);
  const [clarBusy, setClarBusy] = React.useState(false);
  const { scheduleExtract, clarifications, dismissClarification, resolveClarification } = useScratchpadExtraction({
    userId: user?.id ?? null,
    selectedDate,
    blocksRef,
  });

  const ensureOneBlock = React.useCallback(() => {
    if (!user) return;
    if (blocksRef.current.length > 0) return;
    const now = new Date().toISOString();
    const row: Block = {
      id: crypto.randomUUID(),
      user_id: user.id,
      content: "",
      parent_id: null,
      date: selectedDate,
      order_index: 0,
      created_at: now,
    };
    setBlocks([row]);
    dirtyRef.current = true;
  }, [selectedDate, user]);

  const loadForDate = React.useCallback(async () => {
    if (!user) return;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/scratchpad/blocks?date=${encodeURIComponent(selectedDate)}`);
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `Load failed (${res.status})`);
      const rows = (j?.blocks ?? []) as Block[];
      if (seq !== loadSeqRef.current) return;
      setBlocks(sortBlocks(rows));
      setSelectedIds(new Set());
    } catch (e) {
      console.error("[scratchpad] load failed", e);
      if (seq === loadSeqRef.current) setBlocks([]);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [selectedDate, user]);

  React.useEffect(() => {
    void loadForDate();
  }, [loadForDate]);

  const router = useRouter();
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") ?? "").trim().toLowerCase();
  const meetingsView = view === "meetings";
  const openGmailThread = useScratchpadStore((s) => s.openGmailThread);
  /** Last deep link we successfully opened (cleared when query params go away). */
  const openedGmailLinkKeyRef = React.useRef<string>("");
  /** Dedupe in-flight fetch for the same link (Strict Mode / double effect). */
  const gmailDeepLinkInFlightRef = React.useRef<string | null>(null);

  const gmailLinkMid = searchParams.get("gmailMessageId")?.trim() ?? "";
  const gmailLinkAid = searchParams.get("gmailAccountId")?.trim() ?? "";

  React.useEffect(() => {
    if (!user) return;

    if (!gmailLinkMid || !gmailLinkAid) {
      openedGmailLinkKeyRef.current = "";
      gmailDeepLinkInFlightRef.current = null;
      return;
    }

    const key = `${gmailLinkMid}|${gmailLinkAid}`;
    if (openedGmailLinkKeyRef.current === key) return;
    if (gmailDeepLinkInFlightRef.current === key) return;
    gmailDeepLinkInFlightRef.current = key;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/integrations/google/gmail/message?messageId=${encodeURIComponent(gmailLinkMid)}&accountId=${encodeURIComponent(gmailLinkAid)}`,
          { cache: "no-store", credentials: "include" },
        );
        const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (cancelled) return;
        if (!res.ok) {
          gmailDeepLinkInFlightRef.current = null;
          return;
        }
        openGmailThread({
          accountId: gmailLinkAid,
          accountEmail: typeof j?.mailboxEmail === "string" ? j.mailboxEmail : "",
          displayName: null,
          messageId: typeof j?.id === "string" ? j.id : gmailLinkMid,
          threadId: typeof j?.threadId === "string" ? j.threadId : undefined,
          subject: typeof j?.subject === "string" ? j.subject : "(no subject)",
          from: typeof j?.from === "string" ? j.from : "",
          date: typeof j?.date === "string" ? j.date : "",
          snippet: typeof j?.snippet === "string" ? j.snippet : "",
        });
        openedGmailLinkKeyRef.current = key;
        gmailDeepLinkInFlightRef.current = null;
        router.replace("/scratchpad", { scroll: false });
      } catch {
        gmailDeepLinkInFlightRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
      gmailDeepLinkInFlightRef.current = null;
    };
  }, [user, openGmailThread, router, gmailLinkMid, gmailLinkAid]);

  React.useEffect(() => {
    if (!loading) ensureOneBlock();
  }, [ensureOneBlock, loading]);

  /** Browser may cancel normal fetch when tab hides or page unloads; keepalive lets the POST finish (size cap ~64KB). */
  const SCRATCHPAD_KEEPALIVE_MAX = 56 * 1024;

  const flushNow = React.useCallback(
    async (opts?: { keepalive?: boolean }) => {
      if (!user) return;
      if (!dirtyRef.current) return;

      if (inFlightRef.current) {
        pendingRef.current = true;
        return;
      }

      const payload = blocksRef.current.map((b) => ({
        id: b.id,
        user_id: user.id,
        content: b.content,
        parent_id: b.parent_id,
        date: selectedDate,
        order_index: b.order_index,
      }));

      const bodyStr = JSON.stringify({ blocks: payload });
      const useKeepalive =
        Boolean(opts?.keepalive) && bodyStr.length <= SCRATCHPAD_KEEPALIVE_MAX;
      if (opts?.keepalive && bodyStr.length > SCRATCHPAD_KEEPALIVE_MAX) {
        console.warn(
          "[scratchpad] payload exceeds keepalive limit; background save may fail if the tab closes",
        );
      }

      inFlightRef.current = true;
      setStatus("Saving...");
      try {
        const res = await fetch("/api/scratchpad/blocks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: bodyStr,
          ...(useKeepalive ? { keepalive: true as const } : {}),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error || `Save failed (${res.status})`);
        const saved = (j?.blocks ?? []) as Block[];
        setBlocks(sortBlocks(saved));
        dirtyRef.current = false;
        setStatus("Saved");
        window.setTimeout(() => setStatus(null), 900);
        scheduleExtract();
      } catch (e) {
        const isNetworkFail =
          e instanceof TypeError && String(e.message).toLowerCase().includes("fetch");
        if (isNetworkFail && opts?.keepalive) {
          console.warn("[scratchpad] save failed (background)", e);
        } else {
          console.error("[scratchpad] save failed", e);
        }
        const msg = e instanceof Error ? e.message : "Save failed";
        setStatus(msg);
        dirtyRef.current = true;
      } finally {
        inFlightRef.current = false;
        if (pendingRef.current) {
          pendingRef.current = false;
          void flushNow();
        }
      }
    },
    [scheduleExtract, selectedDate, user],
  );

  const { schedule: scheduleFlush } = useDebounced(() => void flushNow(), 550);

  React.useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") void flushNow({ keepalive: true });
    };
    const onUnload = () => {
      void flushNow({ keepalive: true });
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", onUnload);
      void flushNow({ keepalive: true });
    };
  }, [flushNow]);

  const childrenByParent = React.useMemo(() => buildChildrenByParent(blocks), [blocks]);
  const visible = React.useMemo(
    () => buildVisibleRows(childrenByParent, collapsed),
    [childrenByParent, collapsed],
  );
  const visibleIds = React.useMemo(() => visible.map((v) => v.block.id), [visible]);

  const focusEnd = React.useCallback((id: string) => {
    window.setTimeout(() => {
      const el = inputRefs.current[id];
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
    }, 0);
  }, []);

  const setBlockPatch = React.useCallback((id: string, patch: Partial<Block>) => {
    setBlocks((prev) =>
      sortBlocks(
        prev.map((b) => {
          if (b.id !== id) return b;
          return { ...b, ...patch };
        }),
      ),
    );
    dirtyRef.current = true;
    scheduleFlush();
  }, [scheduleFlush]);

  const appendTranscriptToActiveBlock = React.useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      const targetId =
        activeBlockIdRef.current ??
        (visibleIds.length ? visibleIds[visibleIds.length - 1]! : null);
      if (!targetId) return;
      const current = blocksRef.current.find((b) => b.id === targetId);
      const prev = current?.content ?? "";
      const next = prev.trim() ? `${prev.replace(/\s+$/g, "")}\n${t}` : t;
      setBlockPatch(targetId, { content: next });
      focusEnd(targetId);
      scheduleExtract();
    },
    [focusEnd, scheduleExtract, setBlockPatch, visibleIds],
  );

  const reindexChildren = React.useCallback((parentId: string | null) => {
    setBlocks((prev) => {
      const sibs = prev
        .filter((b) => (b.parent_id ?? null) === parentId)
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
      const next = prev.map((b) => {
        if ((b.parent_id ?? null) !== parentId) return b;
        const idx = sibs.findIndex((x) => x.id === b.id);
        return idx >= 0 && b.order_index !== idx ? { ...b, order_index: idx } : b;
      });
      return sortBlocks(next);
    });
    dirtyRef.current = true;
    scheduleFlush();
  }, [scheduleFlush]);

  const createSiblingAfter = React.useCallback((id: string) => {
    if (!user) return;
    const current = blocksRef.current.find((b) => b.id === id);
    if (!current) return;
    const parentId = current.parent_id ?? null;
    const siblings = (childrenByParent.get(parentId) ?? []).map((b) => b.id);
    const idx = siblings.indexOf(id);
    const insertAt = idx >= 0 ? idx + 1 : siblings.length;
    const now = new Date().toISOString();
    const row: Block = {
      id: crypto.randomUUID(),
      user_id: user.id,
      content: "",
      parent_id: parentId,
      date: selectedDate,
      order_index: insertAt,
      created_at: now,
    };
    setBlocks((prev) => sortBlocks([...prev, row]));
    dirtyRef.current = true;
    scheduleFlush();
    window.setTimeout(() => reindexChildren(parentId), 0);
    focusEnd(row.id);
  }, [childrenByParent, focusEnd, reindexChildren, scheduleFlush, selectedDate, user]);

  const indent = React.useCallback((id: string) => {
    const current = blocksRef.current.find((b) => b.id === id);
    if (!current) return;
    const oldParent = current.parent_id ?? null;
    const siblings = childrenByParent.get(oldParent) ?? [];
    const idx = siblings.findIndex((b) => b.id === id);
    if (idx <= 0) return;
    const prevSibling = siblings[idx - 1]!;
    const newParent = prevSibling.id;
    const newOrder = (childrenByParent.get(newParent) ?? []).length;
    setBlockPatch(id, { parent_id: newParent, order_index: newOrder });
    window.setTimeout(() => {
      reindexChildren(oldParent);
      reindexChildren(newParent);
    }, 0);
  }, [childrenByParent, reindexChildren, setBlockPatch]);

  const outdent = React.useCallback((id: string) => {
    const current = blocksRef.current.find((b) => b.id === id);
    if (!current || !current.parent_id) return;
    const oldParent = current.parent_id;
    const parent = blocksRef.current.find((b) => b.id === oldParent);
    const newParent = parent?.parent_id ?? null;
    const siblings = childrenByParent.get(newParent) ?? [];
    const parentIdx = parent ? siblings.findIndex((b) => b.id === parent.id) : -1;
    const insertAt = parentIdx >= 0 ? parentIdx + 1 : siblings.length;
    setBlockPatch(id, { parent_id: newParent, order_index: insertAt });
    window.setTimeout(() => {
      reindexChildren(oldParent);
      reindexChildren(newParent);
    }, 0);
  }, [childrenByParent, reindexChildren, setBlockPatch]);

  const deleteBlocksByIds = React.useCallback(
    (baseIds: Set<string>, anchorId?: string) => {
      if (!user || baseIds.size === 0) return;

      const idsToDelete = new Set<string>(baseIds);
      const queue = [...baseIds];
      while (queue.length > 0) {
        const id = queue.pop()!;
        const kids = childrenByParent.get(id) ?? [];
        for (const child of kids) {
          if (idsToDelete.has(child.id)) continue;
          idsToDelete.add(child.id);
          queue.push(child.id);
        }
      }

      const anchor = anchorId ?? Array.from(baseIds)[0] ?? null;
      const anchorIdx = anchor ? visibleIds.indexOf(anchor) : -1;
      let focusTargetId: string | null = null;
      if (anchorIdx >= 0) {
        for (let i = anchorIdx - 1; i >= 0; i -= 1) {
          const candidate = visibleIds[i]!;
          if (!idsToDelete.has(candidate)) {
            focusTargetId = candidate;
            break;
          }
        }
        if (!focusTargetId) {
          for (let i = anchorIdx + 1; i < visibleIds.length; i += 1) {
            const candidate = visibleIds[i]!;
            if (!idsToDelete.has(candidate)) {
              focusTargetId = candidate;
              break;
            }
          }
        }
      }

      const remaining = blocksRef.current.filter((b) => !idsToDelete.has(b.id));
      if (remaining.length === 0) {
        const now = new Date().toISOString();
        const row: Block = {
          id: crypto.randomUUID(),
          user_id: user.id,
          content: "",
          parent_id: null,
          date: selectedDate,
          order_index: 0,
          created_at: now,
        };
        setBlocks([row]);
        focusEnd(row.id);
      } else {
        const next = sortBlocks(remaining);
        setBlocks(next);
        if (focusTargetId) focusEnd(focusTargetId);
        else focusEnd(next[Math.max(0, next.length - 1)]!.id);
      }

      setSelectedIds(new Set());
      lastSelectedIdRef.current = null;
      dirtyRef.current = true;
      scheduleFlush();
    },
    [childrenByParent, focusEnd, scheduleFlush, selectedDate, user, visibleIds],
  );

  const deleteSelectedBlocks = React.useCallback(() => {
    if (selectedIds.size === 0) return;
    deleteBlocksByIds(new Set(selectedIds), lastSelectedIdRef.current ?? undefined);
  }, [deleteBlocksByIds, selectedIds]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (selectedIds.size === 0) return;
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      e.preventDefault();
      deleteSelectedBlocks();
    };
    const onMouseUp = () => {
      isSelectingRef.current = false;
      dragCurrentIdRef.current = null;
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [deleteSelectedBlocks, selectedIds.size]);

  const selectRangeTo = React.useCallback(
    (endId: string) => {
      const startId = lastSelectedIdRef.current ?? endId;
      const a = visibleIds.indexOf(startId);
      const b = visibleIds.indexOf(endId);
      if (a < 0 || b < 0) {
        setSelectedIds(new Set([endId]));
        return;
      }
      const from = Math.min(a, b);
      const to = Math.max(a, b);
      setSelectedIds(new Set(visibleIds.slice(from, to + 1)));
    },
    [visibleIds],
  );

  React.useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isSelectingRef.current) return;
      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const rowEl = target?.closest("[data-block-row-id]") as HTMLElement | null;
      const rowId = rowEl?.dataset.blockRowId ?? null;
      if (!rowId || rowId === dragCurrentIdRef.current) return;
      dragCurrentIdRef.current = rowId;
      selectRangeTo(rowId);
    };
    document.addEventListener("mousemove", onMouseMove);
    return () => document.removeEventListener("mousemove", onMouseMove);
  }, [selectRangeTo]);

  const todayYmd = React.useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  const displayDate = React.useMemo(() => {
    const [yStr, mStr, dStr] = selectedDate.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    const monthShort = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const weekdayLong = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const date = new Date(y, (m || 1) - 1, d || 1);
    return `${weekdayLong[date.getDay()]}, ${monthShort[(m || 1) - 1]} ${d}, ${y}`;
  }, [selectedDate]);

  if (meetingsView && !gmailComposeOpen && !gmailThreadOpen) {
    return <MeetingsNotes />;
  }

  return (
    <>
      {gmailComposeOpen ? (
        <div className="flex h-[calc(100dvh-6.75rem)] w-full min-h-0 max-h-[calc(100dvh-6.75rem)] flex-col overflow-hidden sm:h-[calc(100dvh-7.25rem)] sm:max-h-[calc(100dvh-7.25rem)]">
          <GmailComposeWorkspace
            accountId={gmailComposeOpen.accountId}
            accountEmail={gmailComposeOpen.accountEmail}
            displayName={gmailComposeOpen.displayName}
            onClose={closeGmailPanel}
          />
        </div>
      ) : gmailThreadOpen ? (
        <div className="flex h-[calc(100dvh-6.75rem)] w-full min-h-0 max-h-[calc(100dvh-6.75rem)] flex-col overflow-hidden sm:h-[calc(100dvh-7.25rem)] sm:max-h-[calc(100dvh-7.25rem)]">
          <GmailThreadWorkspace thread={gmailThreadOpen} onClose={closeGmailPanel} />
        </div>
      ) : (
      <>
      <div className="flex h-[420px] flex-col rounded-lg border border-border bg-background/80 shadow-sm">
        <div className="relative flex items-center justify-end gap-2 border-b border-border px-3 py-2">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-lg font-semibold tracking-wide text-foreground">{displayDate}</div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/scratchpad?view=meetings")}
          className="h-7 rounded-full border border-border bg-muted px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-foreground/5"
        >
          Meetings
        </button>
        <button
          type="button"
          onClick={() => setSelectedDate(todayYmd)}
          className={[
            "h-7 rounded-full border border-border bg-muted px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-foreground/5",
            selectedDate === todayYmd ? "invisible pointer-events-none" : "opacity-100",
          ].join(" ")}
          aria-hidden={selectedDate === todayYmd}
          tabIndex={selectedDate === todayYmd ? -1 : 0}
        >
          Today
        </button>
        <VoiceInput
          compact
          showCompactListeningLabel
          saveTranscriptToTasks={false}
          onStop={(final) => appendTranscriptToActiveBlock(final)}
        />
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? <div className="text-[11px] text-muted-foreground">Loading...</div> : null}
          <div className="space-y-1">
            {visible.map(({ block, depth }) => {
              const hasChildren = (childrenByParent.get(block.id) ?? []).length > 0;
              const isCollapsed = collapsed.has(block.id);
              return (
                <ScratchpadRow
                  key={block.id}
                  block={block}
                  depth={depth}
                  hasChildren={hasChildren}
                  isCollapsed={isCollapsed}
                  isSelected={selectedIds.has(block.id)}
                  setInputRef={(id, el) => {
                    inputRefs.current[id] = el;
                  }}
                  onFocus={(id) => {
                    activeBlockIdRef.current = id;
                  }}
                  onSelectStart={(id) => {
                    const active = document.activeElement;
                    if (active instanceof HTMLTextAreaElement) active.blur();
                    isSelectingRef.current = true;
                    dragCurrentIdRef.current = id;
                    lastSelectedIdRef.current = id;
                    setSelectedIds(new Set([id]));
                  }}
                  onToggleCollapse={(id) =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                  onChange={(id, value) => {
                    setBlockPatch(id, { content: value });
                  }}
                  onKeyDown={(id, e) => {
                  if ((e.key === "Backspace" || e.key === "Delete") && !e.shiftKey) {
                    const current = blocksRef.current.find((b) => b.id === id);
                    const text = (current?.content ?? "").trim();
                    if (text.length === 0) {
                      e.preventDefault();
                      deleteBlocksByIds(new Set([id]), id);
                      return;
                    }
                  }
                  if (e.key === "Enter" && e.shiftKey) {
                    e.preventDefault();
                    const byId = new Map(blocksRef.current.map((b) => [b.id, b]));
                    let cursor = byId.get(id);
                    while (cursor?.parent_id) cursor = byId.get(cursor.parent_id);
                    const root = cursor;
                    if (!root || !user) return;
                    const roots = childrenByParent.get(null) ?? [];
                    const idx = roots.findIndex((b) => b.id === root.id);
                    const insertAt = idx >= 0 ? idx + 1 : roots.length;
                    const now = new Date().toISOString();
                    const row: Block = {
                      id: crypto.randomUUID(),
                      user_id: user.id,
                      content: "",
                      parent_id: null,
                      date: selectedDate,
                      order_index: insertAt,
                      created_at: now,
                    };
                    setBlocks((prev) => sortBlocks([...prev, row]));
                    dirtyRef.current = true;
                    scheduleFlush();
                    window.setTimeout(() => reindexChildren(null), 0);
                    focusEnd(row.id);
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    createSiblingAfter(id);
                    return;
                  }
                  if (e.key === "Tab") {
                    e.preventDefault();
                    if (e.shiftKey) outdent(id);
                    else indent(id);
                  }
                  }}
                />
              );
            })}
          </div>
          <div className="sr-only" aria-live="polite">
            {status ?? ""}
          </div>
        </div>
      </div>
      <ScratchpadGmailStrip />
      </>
      )}
      <SamClarificationModal
        clarification={clarifications[0] ?? null}
        busy={clarBusy}
        onDismiss={async () => {
          const current = clarifications[0];
          if (!current) return;
          setClarBusy(true);
          await dismissClarification(current.id);
          setClarBusy(false);
        }}
        onSubmit={async ({ recipient, dueDate, dueTime }) => {
          const current = clarifications[0];
          if (!current) return;
          const requiresRecipient = current.missing_fields.includes("recipient");
          const requiresDate = current.missing_fields.includes("due_date");
          const requiresTime = current.missing_fields.includes("due_time");
          if (requiresRecipient && !recipient?.trim()) return;
          if (requiresDate && !dueDate) return;
          if (requiresTime && !dueTime) return;
          setClarBusy(true);
          await resolveClarification({
            clarificationId: current.id,
            taskId: current.task_id,
            recipient: recipient?.trim() || undefined,
            dueDate: dueDate || undefined,
            dueTime: dueTime || undefined,
          });
          setClarBusy(false);
        }}
      />
    </>
  );
}

