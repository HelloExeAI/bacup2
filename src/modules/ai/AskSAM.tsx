"use client";

import * as React from "react";
import { useTaskStore } from "@/store/taskStore";
import { StrategyEngine } from "@/modules/ai/StrategyEngine";
import { useEventStore } from "@/store/eventStore";
import { buildSamInput, fetchSamSuggestions } from "@/modules/ai/SmartEngine";

export function AskSAM() {
  const tasks = useTaskStore((s) => s.tasks);
  const events = useEventStore((s) => s.events);

  const fallback = React.useMemo(() => {
    const engine = new StrategyEngine();
    return engine.generateSuggestions(tasks);
  }, [tasks]);

  const [suggestions, setSuggestions] = React.useState<string[] | null>(null);

  React.useEffect(() => {
    const input = buildSamInput(tasks, events);
    const id = window.setTimeout(() => {
      void (async () => {
        try {
          const s = await fetchSamSuggestions(input);
          setSuggestions(s);
        } catch {
          setSuggestions(fallback);
        }
      })();
    }, 700);
    return () => window.clearTimeout(id);
  }, [events, fallback, tasks]);

  return (
    <div className="mt-2 space-y-1.5">
      {suggestions && suggestions.length > 0 ? (
        suggestions.map((s, idx) => (
          <div
            key={`${idx}-${s}`}
            className="rounded-md bg-muted/60 p-1.5 shadow-[0_10px_24px_rgba(0,0,0,0.08)]"
          >
            <div className="text-xs text-foreground">{s}</div>
          </div>
        ))
      ) : (
        <div className="text-xs text-muted-foreground">Thinking…</div>
      )}
    </div>
  );
}

