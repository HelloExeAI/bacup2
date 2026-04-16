"use client";

import { create } from "zustand";

export type MeetingRecorderMode = "closed" | "expanded" | "minimized_floating";

export type MeetingRecorderSource = "smart" | "mic" | "tab";

export type MeetingRecorderSession = {
  started_at: string;
  calendar_title: string | null;
  transcript: string;
};

type MeetingRecorderState = {
  mode: MeetingRecorderMode;
  source: MeetingRecorderSource;
  session: MeetingRecorderSession | null;

  open: () => void;
  close: () => void;
  minimize: () => void;
  expand: () => void;

  setSource: (source: MeetingRecorderSource) => void;
  startSession: (calendar_title: string | null) => void;
  setTranscript: (text: string) => void;
  clearSession: () => void;
};

export const useMeetingRecorderStore = create<MeetingRecorderState>((set, get) => ({
  mode: "closed",
  source: "smart",
  session: null,

  open: () => set({ mode: "expanded" }),
  close: () => set({ mode: "closed" }),
  minimize: () => set({ mode: "minimized_floating" }),
  expand: () => set({ mode: "expanded" }),

  setSource: (source) => set({ source }),

  startSession: (calendar_title) => {
    const started_at = new Date().toISOString();
    set({
      session: {
        started_at,
        calendar_title,
        transcript: "",
      },
    });
  },

  setTranscript: (text) => {
    const s = get().session;
    if (!s) return;
    set({ session: { ...s, transcript: text } });
  },

  clearSession: () => set({ session: null }),
}));

