import { create } from "zustand";

import { coerceClockDisplayFormat, type ClockDisplayFormat } from "@/lib/time/clockDisplay";

type State = {
  clockDisplayFormat: ClockDisplayFormat;
  setClockDisplayFormat: (v: ClockDisplayFormat) => void;
  hydrateFromSettings: (s: { clock_display_format?: unknown }) => void;
};

export const useClockPreferencesStore = create<State>((set) => ({
  clockDisplayFormat: "12h",
  setClockDisplayFormat: (clockDisplayFormat) => set({ clockDisplayFormat }),
  hydrateFromSettings: (row) =>
    set({
      clockDisplayFormat: coerceClockDisplayFormat(row.clock_display_format),
    }),
}));
