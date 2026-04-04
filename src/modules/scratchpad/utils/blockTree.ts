import type { Block } from "@/store/scratchpadStore";

export type VisibleScratchpadRow = {
  block: Block;
  depth: number;
};

export function sortBlocks(blocks: Block[]) {
  return [...blocks].sort((a, b) => {
    if ((a.parent_id ?? "") !== (b.parent_id ?? "")) {
      return (a.parent_id ?? "").localeCompare(b.parent_id ?? "");
    }
    if ((a.order_index ?? 0) !== (b.order_index ?? 0)) {
      return (a.order_index ?? 0) - (b.order_index ?? 0);
    }
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });
}

export function ymdLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildChildrenByParent(blocks: Block[]) {
  const map = new Map<string | null, Block[]>();
  for (const b of blocks) {
    const key = b.parent_id ?? null;
    const list = map.get(key) ?? [];
    list.push(b);
    map.set(key, list);
  }
  for (const [k, list] of map.entries()) {
    map.set(
      k,
      [...list].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    );
  }
  return map;
}

export function buildVisibleRows(
  childrenByParent: Map<string | null, Block[]>,
  collapsed: Set<string>,
) {
  const out: VisibleScratchpadRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const kids = childrenByParent.get(parentId) ?? [];
    for (const k of kids) {
      out.push({ block: k, depth });
      if (!collapsed.has(k.id)) walk(k.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function extractLinkedPageTitles(blocks: Block[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of blocks) {
    const re = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null = null;
    while ((m = re.exec(b.content)) !== null) {
      const title = (m[1] ?? "").trim();
      const key = title.toLowerCase();
      if (!title || seen.has(key)) continue;
      seen.add(key);
      out.push(title);
    }
  }
  return out;
}

