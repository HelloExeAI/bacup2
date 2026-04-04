-- In-app notification bell sound preference (files served from /public/notification-sounds).

alter table public.user_settings
  add column if not exists notification_sound text not null default 'none'
    check (
      notification_sound in (
        'none',
        'notif_1',
        'notif_2',
        'notif_3',
        'notif_4',
        'notif_5',
        'notif_6',
        'notif_7',
        'notif_8'
      )
    );
