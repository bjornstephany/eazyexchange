-- D3 audit (multi-tenancy spec 2026-07-07): the only UPDATE policy without an
-- explicit WITH CHECK. Not a live hole — Postgres applies USING to the
-- post-image when WITH CHECK is absent — but every other UPDATE policy states
-- it explicitly (20260630 convention); make this one match so the invariant
-- "select … from pg_policies where cmd='UPDATE' and with_check is null" stays
-- empty. Expression mirrors the policy's USING verbatim (20260625000005).
alter policy "organizers update submission status" on submissions
  with check (my_role() = 'organizer' and assignment_school(assignment_id) = my_school_id());
