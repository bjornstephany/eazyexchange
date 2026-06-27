-- Track the last time a reminder email was sent for each assignment so the
-- send-reminders edge function can pace reminders: weekly while the deadline is
-- more than 7 days out, then daily during the final week and after the deadline.
--
-- Nullable: a NULL value means "never reminded yet" and triggers the first
-- (weekly) reminder on the next cron run after the assignment is created.

alter table assignments
  add column if not exists last_reminded_at timestamptz;
