"use client";

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 px-4 py-8 text-center">
      <div className="text-base font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{message}</div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground hover:bg-foreground/5"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

