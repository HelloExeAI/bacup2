import { create } from "zustand";

export type Block = {
  id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  date: string | null; // YYYY-MM-DD
  order_index: number;
  created_at: string;
};

function ymdLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Opened from scratchpad mail strip — fills main column (not a modal). */
export type ScratchpadGmailThreadOpen = {
  accountId: string;
  accountEmail: string;
  displayName: string | null;
  messageId: string;
  threadId?: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
};

/** In-app new message (same column as thread view). */
export type ScratchpadGmailComposeOpen = {
  accountId: string;
  accountEmail: string;
  displayName: string | null;
};

type ScratchpadState = {
  selectedDate: string; // YYYY-MM-DD

  blocks: Block[];
  blocksById: Record<string, Block | undefined>;

  setSelectedDate: (ymd: string) => void;

  setBlocks: (blocks: Block[]) => void;
  upsertBlocks: (blocks: Block[]) => void;
  updateBlockLocal: (id: string, patch: Partial<Pick<Block, "content" | "parent_id" | "order_index">>) => void;

  gmailThreadOpen: ScratchpadGmailThreadOpen | null;
  gmailComposeOpen: ScratchpadGmailComposeOpen | null;
  openGmailThread: (t: ScratchpadGmailThreadOpen) => void;
  openGmailCompose: (p: ScratchpadGmailComposeOpen) => void;
  closeGmailPanel: () => void;

  clear: () => void;
};

function toById<T extends { id: string }>(items: T[]) {
  const out: Record<string, T> = {};
  for (const it of items) out[it.id] = it;
  return out;
}

function sortBlocksStable(a: Block, b: Block) {
  if (a.parent_id !== b.parent_id) return (a.parent_id ?? "").localeCompare(b.parent_id ?? "");
  if (a.order_index !== b.order_index) return a.order_index - b.order_index;
  return (a.created_at ?? "").localeCompare(b.created_at ?? "");
}

export const useScratchpadStore = create<ScratchpadState>((set) => ({
  selectedDate: ymdLocal(),

  blocks: [],
  blocksById: {},

  gmailThreadOpen: null,
  gmailComposeOpen: null,
  openGmailThread: (t) => set({ gmailThreadOpen: t, gmailComposeOpen: null }),
  openGmailCompose: (p) => set({ gmailComposeOpen: p, gmailThreadOpen: null }),
  closeGmailPanel: () => set({ gmailThreadOpen: null, gmailComposeOpen: null }),

  setSelectedDate: (ymd) => set({ selectedDate: ymd }),

  setBlocks: (blocks) =>
    set({
      blocks: [...blocks].sort(sortBlocksStable),
      blocksById: toById(blocks),
    }),
  upsertBlocks: (incoming) =>
    set((s) => {
      const map = new Map(s.blocks.map((b) => [b.id, b]));
      incoming.forEach((b) => map.set(b.id, b));
      const blocks = [...map.values()].sort(sortBlocksStable);
      return { blocks, blocksById: toById(blocks) };
    }),
  updateBlockLocal: (id, patch) =>
    set((s) => {
      const current = s.blocksById[id];
      if (!current) return s;
      const next: Block = { ...current, ...patch };
      const blocks = s.blocks.map((b) => (b.id === id ? next : b)).sort(sortBlocksStable);
      return { blocks, blocksById: toById(blocks) };
    }),

  clear: () =>
    set({
      selectedDate: ymdLocal(),
      blocks: [],
      blocksById: {},
      gmailThreadOpen: null,
      gmailComposeOpen: null,
    }),
}));

