-- Organizer feedback (suggestions + bug reports). Source of truth for a future
-- automated triage loop; each insert also pings Bjorn by email (best-effort).
--
-- INSERT-only for authenticated users; the row is stamped with the caller's own
-- auth uid via the RLS with-check. The organizer-role gate lives in the
-- submitFeedback server action, not here — consistent with other organizer
-- actions. No SELECT/UPDATE/DELETE policies: status transitions
-- (new -> reviewed -> done) are made with the service role only (Studio/MCP).

create table feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  type text not null check (type in ('suggestion','bug')),
  message text not null check (char_length(message) between 1 and 2000),
  page_path text,
  status text not null default 'new' check (status in ('new','reviewed','done')),
  created_at timestamptz not null default now()
);

create index feedback_user_idx on feedback(user_id);
create index feedback_school_idx on feedback(school_id);

alter table feedback enable row level security;

-- Single INSERT policy: an authenticated user may only insert rows stamped with
-- their own uid. (select auth.uid()) per the initplan/STABLE convention.
create policy "users insert own feedback" on feedback for insert
  to authenticated
  with check (user_id = (select auth.uid()));
