"use client";

import * as React from "react";
import type { Block } from "@/store/scratchpadStore";

type Props = {
  block: Block;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  isSelected: boolean;
  setInputRef: (id: string, el: HTMLTextAreaElement | null) => void;
  onSelectStart: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onChange: (id: string, value: string) => void;
  onKeyDown: (id: string, e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
};

export const ScratchpadRow = React.memo(function ScratchpadRow({
  block,
  depth,
  hasChildren,
  isCollapsed,
  isSelected,
  setInputRef,
  onSelectStart,
  onToggleCollapse,
  onChange,
  onKeyDown,
}: Props) {
  return (
    <div
      data-block-row-id={block.id}
      className={[
        "group flex min-w-0 items-start gap-0 rounded-sm",
        isSelected ? "bg-foreground/12 ring-1 ring-border/70" : "",
      ].join(" ")}
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button")) return;
        if (target.closest("textarea")) return;
        e.preventDefault();
        onSelectStart(block.id);
      }}
    >
      <div className="flex shrink-0" aria-hidden="true">
        {Array.from({ length: depth }).map((_, i) => (
          <div key={i} className="w-[18px] border-l border-border/60" />
        ))}
      </div>

      <div className="shrink-0" style={{ width: "11px" }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleCollapse(block.id)}
            className={[
              "mt-[4px] inline-flex h-3 w-3 items-center justify-center rounded text-[8px] text-muted-foreground hover:bg-muted/30",
              isCollapsed ? "opacity-0 group-hover:opacity-100" : "hidden",
              "transition-opacity",
            ].join(" ")}
          >
            ▶
          </button>
        ) : null}
      </div>

      <div
        className={[
          "shrink-0 flex justify-end pr-0",
          isCollapsed ? "text-foreground" : "text-muted-foreground",
        ].join(" ")}
        style={{ width: "14px" }}
        aria-hidden="true"
      >
        <span
          className={[
            "mt-[3px] inline-flex h-4.5 w-4.5 items-center justify-center rounded-full text-[12px] leading-none",
            isCollapsed ? "bg-foreground/5" : "",
          ].join(" ")}
        >
          •
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <textarea
          ref={(el) => setInputRef(block.id, el)}
          rows={1}
          value={block.content}
          placeholder=""
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          data-gramm="false"
          data-gramm_editor="false"
          data-enable-grammarly="false"
          onChange={(e) => onChange(block.id, e.target.value)}
          onKeyDown={(e) => onKeyDown(block.id, e)}
          style={{ caretColor: "hsl(var(--foreground))" }}
          className="min-h-[20px] w-full resize-none bg-transparent px-0 py-0.5 text-[13px] leading-[18px] text-foreground focus-visible:outline-none"
        />
      </div>
    </div>
  );
});

