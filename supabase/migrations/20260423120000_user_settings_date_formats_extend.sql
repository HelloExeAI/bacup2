-- Allow additional date display tokens used by mobile Preferences (DD-MM-YY, DD-Mon-yy).
alter table public.user_settings
  drop constraint if exists user_settings_date_display_format_check;

alter table public.user_settings
  add constraint user_settings_date_display_format_check
  check (date_display_format in ('ymd', 'dmy', 'mdy', 'dmy_yy', 'dmy_mon_yy'));
