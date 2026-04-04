"use client";

import * as React from "react";

import type { SamClarification } from "@/modules/scratchpad/hooks/useScratchpadExtraction";

type Props = {
  clarification: SamClarification | null;
  busy?: boolean;
  onDismiss: () => void;
  onSubmit: (data: { recipient?: string; dueDate?: string; dueTime?: string }) => void;
};

function prettyMissingField(field: "recipient" | "due_date" | "due_time") {
  if (field === "recipient") return "Recipient";
  if (field === "due_date") return "Due date";
  return "Due time";
}

export function SamClarificationModal({ clarification, busy = false, onDismiss, onSubmit }: Props) {
  const [recipient, setRecipient] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [dueTime, setDueTime] = React.useState("");

  React.useEffect(() => {
    if (!clarification) return;
    setRecipient("");
    setDueDate("");
    setDueTime("");
  }, [clarification]);

  if (!clarification) return null;

  const requiresRecipient = clarification.missing_fields.includes("recipient");
  const requiresDate = clarification.missing_fields.includes("due_date");
  const requiresTime = clarification.missing_fields.includes("due_time");

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-lg rounded-xl bg-background p-4 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
        <div className="mb-3 text-sm font-semibold text-foreground">SAM needs a quick clarification</div>
        <div className="rounded-lg bg-muted/55 p-3 text-sm text-foreground/90">
          <div className="font-medium">{clarification.rewritten_title}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Missing: {clarification.missing_fields.map(prettyMissingField).join(", ")}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={requiresRecipient ? "sm:col-span-2" : "hidden"}>
            <div className="mb-1 text-xs text-muted-foreground">Recipient</div>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Who is this for?"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none ring-0 focus:border-foreground/35"
            />
          </label>
          <label className={requiresDate ? "" : "hidden"}>
            <div className="mb-1 text-xs text-muted-foreground">Due date</div>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none ring-0 focus:border-foreground/35"
            />
          </label>
          <label className={requiresTime ? "" : "hidden"}>
            <div className="mb-1 text-xs text-muted-foreground">Due time</div>
            <input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none ring-0 focus:border-foreground/35"
            />
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onDismiss}
            className="h-8 rounded-md bg-muted px-3 text-xs font-medium text-foreground/85 disabled:opacity-60"
          >
            Dismiss
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSubmit({ recipient, dueDate, dueTime })}
            className="h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-60"
          >
            Save details
          </button>
        </div>
      </div>
    </div>
  );
}

