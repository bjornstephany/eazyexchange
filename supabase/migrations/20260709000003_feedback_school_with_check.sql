-- D3 (multi-tenancy spec 2026-07-07): the feedback INSERT policy only pinned
-- user_id, so any authenticated user could stamp another school's id on their
-- own feedback row. Trivial impact (feedback is read only via the service
-- role) but it is tenant-integrity drift — pin school_id to the caller's
-- school as well. my_school_id() is the STABLE SECURITY DEFINER helper from
-- 20260625000005/20260705000001; (select …) wrap per the initplan convention.
drop policy "users insert own feedback" on feedback;
create policy "users insert own feedback" on feedback for insert
  to authenticated
  with check (user_id = (select auth.uid()) and school_id = (select my_school_id()));
