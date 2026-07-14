-- i18n Phase 1: per-account language preference.
-- The `users` table holds both organizers and students; `locale` is first
-- written by the organizer settings control in Phase 2. Existing rows default
-- to English (the app's ultimate fallback locale). Access is governed by the
-- existing "users update themselves" policy (20260624000002) — no new policy.
alter table users
  add column locale text not null default 'en'
  check (locale in ('en', 'fr', 'es', 'it', 'de'));
