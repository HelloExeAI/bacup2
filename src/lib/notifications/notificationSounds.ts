export const NOTIFICATION_SOUND_IDS = [
  "none",
  "notif_1",
  "notif_2",
  "notif_3",
  "notif_4",
  "notif_5",
  "notif_6",
  "notif_7",
  "notif_8",
] as const;

export type NotificationSoundId = (typeof NOTIFICATION_SOUND_IDS)[number];

export const NOTIFICATION_SOUND_OPTIONS: { id: NotificationSoundId; label: string }[] = [
  { id: "none", label: "None" },
  { id: "notif_1", label: "Notification 1" },
  { id: "notif_2", label: "Notification 2" },
  { id: "notif_3", label: "Notification 3" },
  { id: "notif_4", label: "Notification 4" },
  { id: "notif_5", label: "Notification 5" },
  { id: "notif_6", label: "Notification 6" },
  { id: "notif_7", label: "Notification 7" },
  { id: "notif_8", label: "Notification 8" },
];

const SOUND_INDEX: Record<Exclude<NotificationSoundId, "none">, number> = {
  notif_1: 1,
  notif_2: 2,
  notif_3: 3,
  notif_4: 4,
  notif_5: 5,
  notif_6: 6,
  notif_7: 7,
  notif_8: 8,
};

export function coerceNotificationSoundId(v: unknown): NotificationSoundId {
  if (typeof v === "string" && (NOTIFICATION_SOUND_IDS as readonly string[]).includes(v)) {
    return v as NotificationSoundId;
  }
  return "none";
}

export function notificationSoundSrc(id: NotificationSoundId): string | null {
  if (id === "none") return null;
  const n = SOUND_INDEX[id];
  return `/notification-sounds/notification-${n}.mp3`;
}

export function playNotificationSound(id: NotificationSoundId): void {
  const src = notificationSoundSrc(id);
  if (!src || typeof window === "undefined") return;
  try {
    const audio = new Audio(src);
    void audio.play().catch(() => {
      /* autoplay or decode blocked */
    });
  } catch {
    /* ignore */
  }
}
