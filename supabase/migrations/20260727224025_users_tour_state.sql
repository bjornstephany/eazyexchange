-- Optional guided tour for organizers: where each account is in the tour.
--
-- The third per-account display preference on `users`, after locale
-- (20260714200924) and exchange_order (20260723132613), and governed the same
-- way: the existing "users update themselves" policy (20260624000002, hardened
-- with an explicit WITH CHECK in 20260630000003) already confines writes to the
-- caller's own row — no new policy.
--
-- 'pending' means "has not been offered or has not answered yet", so every
-- existing organizer is offered the tour once. That is deliberate: the sidebar
-- tabs are no more self-explanatory to them than to a new signup.
--
-- Rank is one-way (pending → dismissed → completed); the server action refuses
-- downgrades so replaying the tour from the account menu cannot un-complete it.
-- That ordering is app-level on purpose: a CHECK cannot see the old row.
alter table users
  add column tour_state text not null default 'pending'
  check (tour_state in ('pending', 'dismissed', 'completed'));

-- 20260725154243 revoked blanket UPDATE on users and re-granted an explicit
-- column list. Postgres column privileges accumulate, so this ADDS tour_state
-- to that list. Re-stating the other columns here would risk silently dropping
-- one if the two statements ever drifted — and `status`, `reviewed_at` and
-- `notes` must stay service-role-only.
grant update (tour_state) on public.users to authenticated;
