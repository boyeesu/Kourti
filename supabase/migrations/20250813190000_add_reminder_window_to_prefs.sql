alter table dashboard_prefs
  add column if not exists reminder_window_days int default 90;
