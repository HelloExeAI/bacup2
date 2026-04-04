-- Top bar flip clock: 12h vs 24h, and whether to use device TZ (travel) vs profile TZ.

alter table public.user_settings
  add column if not exists clock_display_format text not null default '12h'
    check (clock_display_format in ('12h', '24h'));

alter table public.user_settings
  add column if not exists clock_timezone_source text not null default 'device'
    check (clock_timezone_source in ('device', 'profile'));
