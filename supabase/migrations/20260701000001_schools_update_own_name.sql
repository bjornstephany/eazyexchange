-- Organizers who sign up with Google are provisioned with an empty school name
-- (deferred capture). They set it on their first exchange (createExchange),
-- which needs UPDATE on their own school row. Scope strictly to their own school
-- via the existing SECURITY DEFINER helpers (no recursion).
create policy "organizers update their school" on schools for update
  using (my_role() = 'organizer' and id = my_school_id())
  with check (my_role() = 'organizer' and id = my_school_id());
