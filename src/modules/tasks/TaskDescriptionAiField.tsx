"use client";

import { useCallback, useState } from "react";
import type { TaskType } from "@/store/taskStore";

type Props = {
  value: string;
  onChange: (next: string) => void;
  title: string;
  dueDate: string;
  dueTime: string;
  assignedTo: string;
  taskType: TaskType;
  disabled?: boolean;
};

export function TaskDescriptionAiField({
  value,
  onChange,
  title,
  dueDate,
  dueTime,
  assignedTo,
  taskType,
  disabled,
}: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runRedraft = useCallback(async () => {
    const t = title.trim();
    const desc = value.trim();
    if (!t) {
      setError("Add a task title first.");
      return;
    }
    if (!desc) {
      setError("Type a description to redraft.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/tasks/redraft-description", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: t,
          description: desc,
          due_date: dueDate,
          due_time: dueTime,
          assigned_to: assignedTo,
          type: taskType,
          intent: "redraft",
        }),
      });
      const j = (await res.json().catch(() => null)) as { text?: string; error?: string };
      if (!res.ok) throw new Error(j?.error || `Request failed (${res.status})`);
      const text = j?.text?.trim();
      if (!text) throw new Error("No suggestion returned");
      setPreview(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [assignedTo, dueDate, dueTime, taskType, title, value]);

  const acceptPreview = useCallback(() => {
    if (preview) onChange(preview);
    setPreview(null);
    setError(null);
  }, [onChange, preview]);

  const dismissPreview = useCallback(() => {
    setPreview(null);
    setError(null);
  }, []);

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Description
        </span>
        <button
          type="button"
          disabled={disabled || loading || !title.trim() || !value.trim()}
          onClick={() => void runRedraft()}
          className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-semibold text-foreground shadow-sm hover:bg-foreground/5 disabled:opacity-45"
          title="Polish your text (professional, clean)"
        >
          Redraft
        </button>
      </div>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="Optional — notes or context"
          className="mt-1 w-full resize-y rounded-lg bg-muted/80 px-2 py-1.5 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
        />

        {error ? (
          <div className="mt-1 text-[11px] text-red-600 dark:text-red-400" role="alert">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-1 text-[11px] text-muted-foreground">Working on suggestion…</div>
        ) : null}

        {preview ? (
          <div
            className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl bg-background p-3 shadow-[0_1px_0_rgba(70,54,39,0.06),0_12px_36px_rgba(61,45,33,0.18)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
            role="dialog"
            aria-label="Redrafted description"
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Redrafted description
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{preview}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={acceptPreview}
                className="rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background shadow-md hover:opacity-90"
              >
                Use this
              </button>
              <button
                type="button"
                onClick={dismissPreview}
                className="rounded-full bg-muted px-4 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-foreground/5"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
