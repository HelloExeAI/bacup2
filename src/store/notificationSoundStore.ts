import { create } from "zustand";

import type { NotificationSoundId } from "@/lib/notifications/notificationSounds";

type State = {
  soundId: NotificationSoundId;
  setSoundId: (id: NotificationSoundId) => void;
};

export const useNotificationSoundStore = create<State>((set) => ({
  soundId: "none",
  setSoundId: (soundId) => set({ soundId }),
}));
