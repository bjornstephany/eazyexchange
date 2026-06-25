-- Organizers reference partner schools (not just their own) — when creating an
-- exchange (reading back the just-inserted partner school via RETURNING) and on
-- the dashboard (showing partner-school names). The initial SELECT policy only
-- allowed reading one's own school, so those reads were filtered out by RLS.
-- School names aren't sensitive; let organizers read all schools.
create policy "organizers read schools" on schools for select
  using (my_role() = 'organizer');
