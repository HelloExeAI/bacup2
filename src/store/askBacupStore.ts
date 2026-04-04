import { create } from "zustand";

type AskBacupState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

export const useAskBacupStore = create<AskBacupState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),
}));
