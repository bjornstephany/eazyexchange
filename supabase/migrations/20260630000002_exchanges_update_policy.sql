-- The exchanges table shipped with SELECT + INSERT policies but NO UPDATE
-- policy. The application funnel added setApplicationOpen (actions/exchanges.ts),
-- which UPDATEs exchanges.application_open / application_deadline through the
-- RLS-enforced client. With no UPDATE policy, RLS filters the row out: the
-- UPDATE matches zero rows, returns no error, and nothing changes — so the
-- organizer's "open applications" toggle silently no-ops.
--
-- Add the missing UPDATE policy, scoped to the organizer's own school (mirrors
-- the SELECT/INSERT policies), with a matching WITH CHECK so the post-update row
-- must still belong to the organizer's school (can't be re-pointed elsewhere).
create policy "organizers update exchanges" on exchanges for update
  using (
    my_role() = 'organizer'
    and (school_a_id = my_school_id() or school_b_id = my_school_id())
  )
  with check (
    my_role() = 'organizer'
    and (school_a_id = my_school_id() or school_b_id = my_school_id())
  );
