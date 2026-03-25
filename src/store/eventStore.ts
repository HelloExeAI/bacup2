import { create } from "zustand";

export type Event = {
  id: string;
  user_id: string;
  title: string | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM:SS or HH:MM
  linked_task_id: string | null;
  created_at: string | null;
};

type EventState = {
  events: Event[];
  setEvents: (events: Event[]) => void;
  upsertEvents: (events: Event[]) => void;
  clear: () => void;
};

function sortByDateTimeAsc(a: Event, b: Event) {
  const ak = `${a.date ?? ""} ${a.time ?? ""}`;
  const bk = `${b.date ?? ""} ${b.time ?? ""}`;
  return ak.localeCompare(bk);
}

export const useEventStore = create<EventState>((set) => ({
  events: [],
  setEvents: (events) => set({ events: [...events].sort(sortByDateTimeAsc) }),
  upsertEvents: (incoming) =>
    set((s) => {
      const map = new Map(s.events.map((e) => [e.id, e]));
      incoming.forEach((e) => map.set(e.id, e));
      return { events: [...map.values()].sort(sortByDateTimeAsc) };
    }),
  clear: () => set({ events: [] }),
}));

