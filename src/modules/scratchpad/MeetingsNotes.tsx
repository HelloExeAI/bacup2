"use client";

import * as React from "react";

type ParentRow = { id: string; content: string; created_at: string };
type ChildRow = { id: string; parent_id: string; content: string; created_at: string };

export function MeetingsNotes() {
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [parents, setParents] = React.useState<ParentRow[]>([]);
  const [children, setChildren] = React.useState<ChildRow[]>([]);
  const [selectedParentId, setSelectedParentId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void (async () => {
      try {
        const res = await fetch("/api/meetings", { cache: "no-store", credentials: "include" });
        const j = (await res.json().catch(() => null)) as { parents?: ParentRow[]; children?: ChildRow[]; error?: string } | null;
        if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Failed to load meetings");
        if (cancelled) return;
        const p = Array.isArray(j?.parents) ? j!.parents! : [];
        const c = Array.isArray(j?.children) ? j!.children! : [];
        setParents(p);
        setChildren(c);
        if (!selectedParentId && p.length > 0) setSelectedParentId(p[0]!.id);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load meetings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedParent = parents.find((p) => p.id === selectedParentId) ?? null;
  const sessions = React.useMemo(() => {
    if (!selectedParentId) return [];
    const list = children.filter((c) => c.parent_id === selectedParentId);
    return [...list].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  }, [children, selectedParentId]);

  return (
    <div className="flex h-[calc(100dvh-6.75rem)] min-h-0 w-full flex-col overflow-hidden sm:h-[calc(100dvh-7.25rem)]">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="text-sm font-semibold text-foreground">Meetings</div>
        <div className="text-[11px] text-muted-foreground">Transcripts are saved automatically when you stop recording.</div>
      </div>

      {loading ? <div className="p-3 text-xs text-muted-foreground">Loading…</div> : null}
      {err ? (
        <div className="p-3 text-xs text-red-800 dark:text-red-200">
          {err}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-[min(340px,40%)] shrink-0 border-r border-border/60 bg-muted/10">
          {parents.length === 0 && !loading ? (
            <div className="p-3 text-xs text-muted-foreground">No meetings yet.</div>
          ) : (
            <ul className="max-h-full overflow-y-auto p-2">
              {parents.map((p) => {
                const active = p.id === selectedParentId;
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
                        {new Date(p.created_at).toLocaleString()}
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
            <div className="p-4 text-sm text-muted-foreground">Select a meeting.</div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No sessions yet for this meeting.</div>
          ) : (
            <div className="h-full overflow-y-auto p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {selectedParent.content}
              </div>
              <div className="space-y-3">
                {sessions.map((s) => (
                  <div key={s.id} className="rounded-xl border border-border/60 bg-background/80 p-3 shadow-sm">
                    <div className="text-[10px] text-muted-foreground">{new Date(s.created_at).toLocaleString()}</div>
                    <pre className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {s.content}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

