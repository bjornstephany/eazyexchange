-- Drop the two self-declared signup intake fields.
-- Spec: docs/superpowers/specs/2026-07-27-signup-slimming-design.md
--
-- Added on 2026-07-25 with the approval gate to inform the /admin decision.
-- That decision is made over private email with the applicant, so the fields
-- only cost two required inputs at the highest-friction moment in the funnel.
-- Nothing reads or writes them as of this migration.
--
-- No revoke/grant pair here, deliberately. 20260725154243 listed both columns
-- in `grant update (...) on public.users to authenticated`, and the obvious
-- fix — revoke wholesale, re-grant the survivors — would clobber any column
-- grant a concurrent migration had added in the meantime (20260727195338 adds
-- tour_state exactly that way, additively). Dropping a column drops its
-- privileges with it, so the ACL lands correct whatever the apply order.

alter table public.users
  drop column role_description,
  drop column how_found_us;
