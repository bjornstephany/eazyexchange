-- Phase 1 application funnel. Applications are submitted anonymously (no auth
-- user) via service-role server actions keyed by secret tokens, mirroring the
-- inviteStudent/provisionOrganizer pattern. Organizers read/review their own
-- school's applications through RLS-enforced policies below.

-- Exchange-level controls for the public application link.
alter table exchanges add column if not exists application_open boolean not null default false;
alter table exchanges add column if not exists application_deadline date;
alter table exchanges add column if not exists apply_slug text unique;

-- Backfill a slug for existing exchanges so their public link resolves.
update exchanges
set apply_slug = lower(regexp_replace(coalesce(name, 'exchange'), '[^a-zA-Z0-9]+', '-', 'g'))
                 || '-' || substr(md5(id::text), 1, 8)
where apply_slug is null;

create table applications (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null references exchanges(id) on delete cascade,
  school_id uuid not null references schools(id),
  email text not null,
  resume_token text not null unique,
  invite_token text unique,
  status text not null default 'draft'
    check (status in ('draft','submitted','rejected','accepted','declined','maybe','enrolled')),
  data jsonb not null default '{}'::jsonb,
  photo_path text,
  language text not null default 'en' check (language in ('en','fr')),
  invite_response text check (invite_response in ('yes','no','maybe')),
  invite_response_note text,
  responded_at timestamptz,
  enrolled_user_id uuid references users(id),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewer_id uuid references users(id),
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index applications_exchange_idx on applications(exchange_id);
create index applications_school_idx on applications(school_id);

alter table applications enable row level security;

-- Organizers read/update only their own school's applications. No INSERT policy:
-- the public draft/submit path writes via the service-role client, and organizers
-- never create applications directly.
create policy "organizers read school applications" on applications for select
  using (my_role() = 'organizer' and school_id = my_school_id());
create policy "organizers update school applications" on applications for update
  using (my_role() = 'organizer' and school_id = my_school_id());
