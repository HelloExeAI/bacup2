"use client";

export function RightPanel() {
  return (
    <aside className="hidden w-80 shrink-0 border-l border-border bg-background xl:block">
      <div className="space-y-4 p-4">
        <section className="rounded-lg border border-border bg-background p-4 shadow-sm">
          <div className="text-sm font-semibold">Today&apos;s Focus</div>
          <div className="mt-1 text-sm text-muted-foreground">Placeholder</div>
        </section>
        <section className="rounded-lg border border-border bg-background p-4 shadow-sm">
          <div className="text-sm font-semibold">SAM Suggestions</div>
          <div className="mt-1 text-sm text-muted-foreground">Placeholder</div>
        </section>
      </div>
    </aside>
  );
}

