-- Personal sidebar ordering for exchanges (organizer drag-and-drop).
-- Mirrors 20260714200924_users_locale.sql: a per-account display preference on
-- `users`, governed by the existing "users update themselves" policy
-- (20260624000002) — no new policy, no new table.
--
-- Display-only by construction: the stored ids are intersected against the
-- exchanges RLS already lets the viewer read, so a stale or junk id is simply
-- ignored and can reveal nothing. Writes are confined to the caller's own row.
alter table users
  add column exchange_order uuid[] not null default '{}';
