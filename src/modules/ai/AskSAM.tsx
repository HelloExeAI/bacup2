"use client";

import * as React from "react";
import { useTaskStore } from "@/store/taskStore";
import { StrategyEngine } from "@/modules/ai/StrategyEngine";
import { useEventStore } from "@/store/eventStore";
import { buildSamInput, fetchSamSuggestions } from "@/modules/ai/SmartEngine";

export function AskSAM() {
  const tasks = useTaskStore((s) => s.tasks);
  const events = useEventStore((s) => s.events);

  const v1 = React.useMemo(() => {
    const engine = new StrategyEngine();
    return engine.generateSuggestions(tasks);
  }, [tasks]);

  const [v2, setV2] = React.useState<string[] | null>(null);
  const [v2Error, setV2Error] = React.useState<string | null>(null);

  React.useEffect(() => {
    const input = buildSamInput(tasks, events);
    const id = window.setTimeout(() => {
      void (async () => {
        try {
          setV2Error(null);
          const s = await fetchSamSuggestions(input);
          setV2(s);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "SAM failed";
          setV2Error(msg);
          setV2(null);
        }
      })();
    }, 700);
    return () => window.clearTimeout(id);
  }, [events, tasks]);

  return (
    <div className="mt-2 space-y-3">
      <div className="text-xs font-semibold text-muted-foreground">SAM v2 (AI)</div>
      {v2Error ? (
        <div className="rounded-md border border-border bg-muted p-2 text-sm text-muted-foreground">
          {v2Error}
        </div>
      ) : v2 && v2.length > 0 ? (
        <div className="space-y-2">
          {v2.map((s, idx) => (
            <div
              key={`v2-${idx}-${s}`}
              className="rounded-md border border-border bg-muted p-2"
            >
              <div className="text-sm text-foreground">{s}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Thinking…</div>
      )}

      <div className="text-xs font-semibold text-muted-foreground">SAM v1</div>
      <div className="space-y-2">
        {v1.map((s, idx) => (
          <div key={`v1-${idx}-${s}`} className="rounded-md border border-border p-2">
            <div className="text-sm text-foreground">{s}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

