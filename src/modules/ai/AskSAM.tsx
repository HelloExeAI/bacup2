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
  const [usingFallback, setUsingFallback] = React.useState(false);

  React.useEffect(() => {
    const input = buildSamInput(tasks, events);
    const id = window.setTimeout(() => {
      void (async () => {
        try {
          const s = await fetchSamSuggestions(input);
          setSuggestions(s);
          setUsingFallback(false);
        } catch {
          setSuggestions(fallback);
          setUsingFallback(true);
        }
      })();
    }, 700);
    return () => window.clearTimeout(id);
  }, [events, fallback, tasks]);

  return (
    <div className="mt-2 space-y-2">
      {usingFallback ? (
        <div className="text-xs text-muted-foreground">
          SAM is running in fallback mode.
        </div>
      ) : null}

      {suggestions && suggestions.length > 0 ? (
        suggestions.map((s, idx) => (
          <div
            key={`${idx}-${s}`}
            className="rounded-md border border-border bg-muted p-2"
          >
            <div className="text-sm text-foreground">{s}</div>
          </div>
        ))
      ) : (
        <div className="text-sm text-muted-foreground">Thinking…</div>
      )}
    </div>
  );
}

