-- Organizers create the partner school when setting up an exchange
-- (see createExchange in actions/exchanges.ts). The initial schema enabled
-- RLS on `schools` with only a SELECT policy, so that insert was denied.
create policy "organizers insert schools" on schools for insert
  with check (my_role() = 'organizer');
