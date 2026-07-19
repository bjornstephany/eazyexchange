-- Key-information cards per exchange. Organizers author them (Communication →
-- Infos); enrolled students read them (student portal « Infos » tab).
create table exchange_info_cards (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null references exchanges(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FK index (matches the repo's unindexed-FK convention).
create index exchange_info_cards_exchange_id_idx on exchange_info_cards (exchange_id);

alter table exchange_info_cards enable row level security;

-- Organizers whose school is either side of the exchange: full R/W.
-- Non-recursive: references exchanges + the stable my_role()/my_school_id()
-- helpers only (no self-reference on exchange_info_cards).
create policy "organizers manage exchange info cards" on exchange_info_cards for all
  using (
    my_role() = 'organizer' and exists (
      select 1 from exchanges e
      where e.id = exchange_info_cards.exchange_id
        and (e.school_a_id = my_school_id() or e.school_b_id = my_school_id())
    )
  )
  with check (
    my_role() = 'organizer' and exists (
      select 1 from exchanges e
      where e.id = exchange_info_cards.exchange_id
        and (e.school_a_id = my_school_id() or e.school_b_id = my_school_id())
    )
  );

-- Enrolled students: read only. Mirrors « students read enrolled exchanges ».
create policy "students read enrolled exchange info cards" on exchange_info_cards for select
  using (
    exists (
      select 1 from exchange_enrollments en
      where en.exchange_id = exchange_info_cards.exchange_id
        and en.user_id = (select auth.uid())
    )
  );
