-- Date display/input preference shared across web + mobile.

alter table public.user_settings
  add column if not exists date_display_format text not null default 'ymd'
    check (date_display_format in ('ymd', 'dmy', 'mdy'));

