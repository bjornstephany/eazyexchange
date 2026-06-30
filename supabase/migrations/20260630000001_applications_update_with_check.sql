-- Defense-in-depth for the applications UPDATE policy.
--
-- The original policy (20260629000001) had only a USING clause, which gates
-- WHICH rows an organizer may update but not what the row may become. Without a
-- WITH CHECK, an organizer could (via a direct PostgREST call) update one of
-- their own school's applications and re-point its school_id to another school,
-- pushing the row out of their own view. Add a matching WITH CHECK so the
-- post-update row must still belong to the organizer's school.
--
-- No cross-tenant READ is possible either way (the SELECT policy is unchanged);
-- this only closes a write-side integrity gap. Mirrors the school-scoping used
-- throughout the schema.
alter policy "organizers update school applications" on applications
  with check (my_role() = 'organizer' and school_id = my_school_id());
