"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { useScratchpadStore } from "@/store/scratchpadStore";

type ParentRow = { id: string; content: string; created_at: string };
type ChildRow = { id: string; parent_id: string; content: string; created_at: string };

function ymdLocalFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toLocalYmdFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return ymdLocalFromDate(d);
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

export function MeetingsNotes() {
  const selectedDate = useScratchpadStore((s) => s.selectedDate);
  const setSelectedDate = useScratchpadStore((s) => s.setSelectedDate);

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [parents, setParents] = React.useState<ParentRow[]>([]);
  const [children, setChildren] = React.useState<ChildRow[]>([]);
  const [selectedParentId, setSelectedParentId] = React.useState<string | null>(null);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const searchReqSeq = React.useRef(0);
  const [searchRemote, setSearchRemote] = React.useState<{
    query: string;
    parents: ParentRow[];
    children: ChildRow[];
  } | null>(null);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchErr, setSearchErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void (async () => {
      try {
        const res = await fetch("/api/meetings", { cache: "no-store", credentials: "include" });
        const j = (await res.json().catch(() => null)) as {
          parents?: ParentRow[];
          children?: ChildRow[];
          error?: string;
        } | null;
        if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Failed to load meetings");
        if (cancelled) return;
        const p = Array.isArray(j?.parents) ? j!.parents! : [];
        const c = Array.isArray(j?.children) ? j!.children! : [];
        setParents(p);
        setChildren(c);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load meetings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (searchOpen) {
      const t = window.setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [searchOpen]);

  React.useEffect(() => {
    const raw = searchQuery.trim();
    if (raw.length < 2) {
      setSearchRemote(null);
      setSearchErr(null);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    setSearchErr(null);
    const seq = ++searchReqSeq.current;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/meetings?search=${encodeURIComponent(raw)}`, {
            cache: "no-store",
            credentials: "include",
          });
          const j = (await res.json().catch(() => null)) as {
            parents?: ParentRow[];
            children?: ChildRow[];
            error?: string;
          } | null;
          if (seq !== searchReqSeq.current) return;
          if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Search failed");
          setSearchRemote({
            query: raw,
            parents: Array.isArray(j?.parents) ? j!.parents! : [],
            children: Array.isArray(j?.children) ? j!.children! : [],
          });
        } catch (e) {
          if (seq !== searchReqSeq.current) return;
          setSearchRemote(null);
          setSearchErr(e instanceof Error ? e.message : "Search failed");
        } finally {
          if (seq === searchReqSeq.current) setSearchLoading(false);
        }
      })();
    }, 380);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

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

  const isViewingToday = selectedDate === ymdLocalFromDate(new Date());

  const childrenOnDay = React.useMemo(
    () => children.filter((c) => toLocalYmdFromIso(c.created_at) === selectedDate),
    [children, selectedDate],
  );

  const rawSearch = searchQuery.trim();
  const remoteChildren =
    rawSearch.length >= 2 && searchRemote?.query === rawSearch ? searchRemote.children : null;

  const childrenFiltered = React.useMemo(() => {
    if (rawSearch.length >= 2) {
      if (remoteChildren !== null) return remoteChildren;
      return [];
    }
    if (!rawSearch) return childrenOnDay;
    const q = rawSearch.toLowerCase();
    return childrenOnDay.filter((c) => {
      const parent = parents.find((p) => p.id === c.parent_id);
      const title = (parent?.content ?? "").toLowerCase();
      return c.content.toLowerCase().includes(q) || title.includes(q);
    });
  }, [childrenOnDay, parents, rawSearch, remoteChildren]);

  const filteredParents = React.useMemo(() => {
    if (rawSearch.length >= 2 && searchRemote?.query === rawSearch) {
      const latest = new Map<string, string>();
      for (const c of searchRemote.children) {
        const prev = latest.get(c.parent_id);
        if (!prev || (c.created_at ?? "") > prev) latest.set(c.parent_id, c.created_at ?? "");
      }
      return [...searchRemote.parents].sort((a, b) => {
        const ta = latest.get(a.id) ?? a.created_at;
        const tb = latest.get(b.id) ?? b.created_at;
        return tb.localeCompare(ta);
      });
    }
    const ids = new Set(childrenFiltered.map((c) => c.parent_id));
    return parents.filter((p) => ids.has(p.id));
  }, [parents, childrenFiltered, rawSearch, searchRemote]);

  const latestChildIsoByParent = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of childrenFiltered) {
      const prev = map.get(c.parent_id);
      if (!prev || (c.created_at ?? "") > prev) map.set(c.parent_id, c.created_at ?? "");
    }
    return map;
  }, [childrenFiltered]);

  React.useEffect(() => {
    if (filteredParents.length === 0) {
      setSelectedParentId(null);
      return;
    }
    setSelectedParentId((prev) =>
      prev && filteredParents.some((p) => p.id === prev) ? prev : filteredParents[0]!.id,
    );
  }, [filteredParents]);

  const selectedParent = filteredParents.find((p) => p.id === selectedParentId) ?? null;
  const sessions = React.useMemo(() => {
    if (!selectedParentId) return [];
    const list = childrenFiltered.filter((c) => c.parent_id === selectedParentId);
    return [...list].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  }, [childrenFiltered, selectedParentId]);

  const searchActive = searchQuery.trim().length > 0;
  const remoteSearchActive = rawSearch.length >= 2;

  return (
    <div className="flex h-[calc(100dvh-6.75rem)] min-h-0 w-full flex-col overflow-hidden font-sans sm:h-[calc(100dvh-7.25rem)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="text-sm font-semibold tracking-tight text-foreground">Meetings</div>
        <div className="flex min-w-0 flex-1 basis-[8rem] flex-col items-center justify-center text-center">
          <div className="truncate text-xs font-medium text-muted-foreground sm:text-sm">
            {remoteSearchActive ? "Search · all recordings" : displayDate}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSearchOpen((o) => !o)}
            className={[
              "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/80 text-foreground transition-colors hover:bg-foreground/5",
              searchOpen || searchActive ? "border-foreground/25 bg-foreground/5" : "",
            ].join(" ")}
            aria-expanded={searchOpen}
            aria-label={searchOpen ? "Close search" : "Search transcripts"}
          >
            <SearchIcon />
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(ymdLocalFromDate(new Date()))}
            className={[
              "h-8 rounded-full border border-border bg-muted px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-foreground/5",
              isViewingToday ? "invisible pointer-events-none" : "",
            ].join(" ")}
            aria-hidden={isViewingToday}
            tabIndex={isViewingToday ? -1 : 0}
          >
            Today
          </button>
        </div>
      </div>

      {searchOpen ? (
        <div className="border-b border-border/80 px-3 py-2">
          <Input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search all conversations (2+ letters)…"
            className="h-9 text-[13px]"
            aria-label="Search meeting transcripts"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchOpen(false);
                setSearchQuery("");
              }
            }}
          />
          {searchErr ? <div className="mt-1.5 text-[11px] text-red-700 dark:text-red-300">{searchErr}</div> : null}
          {rawSearch.length === 1 ? (
            <div className="mt-1.5 text-[11px] text-muted-foreground">Enter at least 2 characters to search history.</div>
          ) : null}
        </div>
      ) : null}

      <div className="hidden border-b border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground sm:block">
        Transcripts save when you stop recording. Search looks through all saved transcripts. Pick a day in the sidebar to
        browse by date.
      </div>

      {loading ? <div className="p-3 text-xs text-muted-foreground">Loading…</div> : null}
      {err ? <div className="p-3 text-xs text-red-800 dark:text-red-200">{err}</div> : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-[min(340px,40%)] shrink-0 border-r border-border/60 bg-muted/10">
          {filteredParents.length === 0 && !loading ? (
            <div className="p-3 text-xs text-muted-foreground">
              {parents.length === 0
                ? "No meetings yet."
                : remoteSearchActive && searchLoading
                  ? "Searching…"
                  : remoteSearchActive
                    ? "No matches in your recordings."
                    : searchActive
                      ? "No matches for this day."
                      : "No recordings on this day."}
            </div>
          ) : (
            <ul className="max-h-full overflow-y-auto p-2">
              {filteredParents.map((p) => {
                const active = p.id === selectedParentId;
                const latestIso = latestChildIsoByParent.get(p.id) ?? p.created_at;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedParentId(p.id)}
                      className={[
                        "w-full rounded-lg border px-3 py-2 text-left text-sm",
                        active
                          ? "border-foreground/20 bg-foreground/5"
                          : "border-border/60 bg-background/70 hover:bg-foreground/5",
                      ].join(" ")}
                    >
                      <div className="font-medium text-foreground line-clamp-2">{p.content}</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(latestIso).toLocaleString()}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="min-w-0 flex-1 overflow-hidden">
          {!selectedParent ? (
            <div className="p-4 text-sm text-muted-foreground">
              {filteredParents.length === 0 ? "" : "Select a meeting."}
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No sessions match for this meeting.</div>
          ) : (
            <div className="h-full overflow-y-auto p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {selectedParent.content}
              </div>
              <div className="space-y-3">
                {sessions.map((s) => (
                  <SessionTranscript key={s.id} session={s} highlight={searchQuery.trim()} />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SessionTranscript({ session, highlight }: { session: ChildRow; highlight: string }) {
  const rawQ = highlight.trim();
  const q = rawQ.toLowerCase();
  if (!q) {
    return (
      <div className="rounded-xl border border-border/60 bg-background/80 p-3 shadow-sm">
        <div className="text-[10px] text-muted-foreground">{new Date(session.created_at).toLocaleString()}</div>
        <div className="mt-2 whitespace-pre-wrap text-sm font-sans leading-relaxed tracking-normal text-foreground antialiased">
          {session.content}
        </div>
      </div>
    );
  }

  const text = session.content;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-background/80 p-3 shadow-sm">
        <div className="text-[10px] text-muted-foreground">{new Date(session.created_at).toLocaleString()}</div>
        <div className="mt-2 whitespace-pre-wrap text-sm font-sans leading-relaxed tracking-normal text-foreground antialiased">
          {text}
        </div>
      </div>
    );
  }

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);

  return (
    <div className="rounded-xl border border-border/60 bg-background/80 p-3 shadow-sm">
      <div className="text-[10px] text-muted-foreground">{new Date(session.created_at).toLocaleString()}</div>
      <div className="mt-2 whitespace-pre-wrap text-sm font-sans leading-relaxed tracking-normal text-foreground antialiased">
        {before}
        <mark className="rounded-sm bg-amber-200/90 px-0.5 text-foreground dark:bg-amber-500/35">{match}</mark>
        {after}
      </div>
    </div>
  );
}
