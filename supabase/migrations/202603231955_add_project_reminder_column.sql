alter table projects
add column if not exists last_reminder_sent_at timestamptz;
