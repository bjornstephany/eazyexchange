-- Code-review follow-up (2026-06-30): expire the public application tokens so a
-- leaked resume/invite link can't read a minor's PII (or decline an invite)
-- indefinitely.
--   resume_token: valid until the end of the exchange's application deadline
--                 (the day after, at 00:00 UTC, matching the submit window), or
--                 30 days from creation when the exchange has no deadline.
--   invite_token: valid 7 days from when the organizer sent it.

alter table applications
  add column if not exists resume_token_expires_at timestamptz,
  add column if not exists invite_token_expires_at timestamptz;

-- Backfill existing rows so they aren't treated as "never expires".
-- Resume: deadline day + 1 (00:00 UTC) — the moment applicationsClosed() flips —
-- else created_at + 30 days.
update applications a
  set resume_token_expires_at = coalesce(
    (select e.application_deadline::timestamptz + interval '1 day'
       from exchanges e
       where e.id = a.exchange_id and e.application_deadline is not null),
    a.created_at + interval '30 days')
  where resume_token_expires_at is null;

-- Invite: 7 days after it was issued (reviewed_at = accept time), only for rows
-- that actually carry an invite_token.
update applications a
  set invite_token_expires_at = coalesce(a.reviewed_at, a.created_at) + interval '7 days'
  where invite_token is not null and invite_token_expires_at is null;
