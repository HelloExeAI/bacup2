import { create } from "zustand";

type AskBacupState = {
  open: boolean;
  /** Prefills the Ask Bacup composer when the dock opens (then cleared). */
  draftMessage: string | null;
  setOpen: (open: boolean) => void;
  setDraftMessage: (message: string | null) => void;
  /** Opens the dock and sets the draft in one update (avoids race with effects). */
  openWithDraft: (message: string) => void;
  toggle: () => void;
};

export const useAskBacupStore = create<AskBacupState>((set, get) => ({
  open: false,
  draftMessage: null,
  setOpen: (open) => set({ open }),
  setDraftMessage: (message) => set({ draftMessage: message }),
  openWithDraft: (message) => set({ open: true, draftMessage: message }),
  toggle: () => set({ open: !get().open }),
}));
