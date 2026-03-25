"use client";

import * as React from "react";
import { useTaskStore } from "@/store/taskStore";
import { StrategyEngine } from "@/modules/ai/StrategyEngine";

export function AskSAM() {
  const tasks = useTaskStore((s) => s.tasks);

  const suggestions = React.useMemo(() => {
    const engine = new StrategyEngine();
    return engine.generateSuggestions(tasks);
  }, [tasks]);

  return (
    <div className="mt-2 space-y-2">
      {suggestions.map((s, idx) => (
        <div key={`${idx}-${s}`} className="rounded-md border border-border p-2">
          <div className="text-sm text-foreground">{s}</div>
        </div>
      ))}
    </div>
  );
}

