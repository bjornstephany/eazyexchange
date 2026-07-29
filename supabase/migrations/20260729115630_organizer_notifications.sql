-- Cross-exchange "what is waiting for me" digest behind the header bell.
--
-- Derived, not recorded: there is no notifications table and no write points.
-- Everything here is computed from rows that already exist. The deferred event
-- feed would add a fourth union-all branch rather than replace this.
-- Spec: docs/superpowers/specs/2026-07-29-notifications-dropdown-design.md

-- 1. The seen-watermark. Nullable on purpose: null means "never opened the
-- bell", so on first sight every open item counts as new.
--
-- Fourth per-account display preference on `users` after locale
-- (20260714200924), exchange_order (20260723132613) and tour_state
-- (20260727224025), and governed identically: the existing "users update
-- themselves" policy (20260624000002, hardened in 20260630000003) already
-- confines the write to the caller's own row — no new policy.
alter table users add column notifications_seen_at timestamptz;

-- 20260725154243 revoked blanket UPDATE on users and re-granted an explicit
-- column list. Postgres column privileges accumulate, so this ADDS one column.
-- Do NOT restate the others: `status`, `reviewed_at` and `notes` must stay
-- service-role-only.
grant update (notifications_seen_at) on public.users to authenticated;

-- 2. The aggregate.
--
-- PARITY CONTRACT (load-bearing, not decoration): the bell reuses the
-- dashboard's own action-card wording, so the same words must never carry
-- different numbers. Every predicate below is therefore defined to be
-- EQUIVALENT to the derivation in `lib/dashboard/rollup.ts` — that file is the
-- reference implementation, this SQL is the copy. Change one, change the other.
-- The per-branch comments spell out which rollup.ts expression each mirrors.
--
-- KNOWN, DELIBERATE DIVERGENCE (accepted, latent today): the dashboard's rows
-- come from `getExchangeGrid` (actions/exchanges.ts:167-206), which additionally
-- restricts to `form_templates.status = 'active'` and to students present in
-- `exchange_enrollments`. Neither filter is restated here, because neither can
-- change a count today: a `draft` template has no assignments (the assign
-- triggers in 20260703000001 only fire for status='active', audience='all'), and
-- assignments only ever exist for enrolled students. What would break it: any
-- code path that reverts an active template to `draft` while keeping its
-- assignments, or that un-enrolls a student without deleting theirs. Adding
-- either means adding the two filters here in the same change.
--
-- SECURITY INVOKER is the whole security story: RLS on applications,
-- submissions, assignments and form_templates already scopes an organizer to
-- their own school, so this inherits the caller's policies instead of
-- restating them. The my_role() guard is also the approval gate — my_role()
-- returns the role only when users.status = 'approved', so a pending organizer
-- gets zero rows for free.
create function public.organizer_notifications()
returns table (
  exchange_id uuid,
  kind        text,
  total       int,
  new_count   int,
  newest_at   timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with seen as (
    select coalesce(
      (select u.notifications_seen_at from users u where u.id = (select auth.uid())),
      '-infinity'::timestamptz
    ) as at
  ),
  items as (
    -- Candidatures à examiner: the subject IS the application, so the dedup
    -- below is a no-op for this branch.
    select a.exchange_id, 'applications_to_review'::text as kind,
           a.id::text as subject, a.submitted_at as event_at
      from applications a
      join exchanges e on e.id = a.exchange_id
     where a.status = 'submitted'
       and a.submitted_at is not null
       and e.archived_at is null

    union all

    -- Dossiers à vérifier: subject is the STUDENT, not the submission, so the
    -- count equals the dashboard's « n dossiers à vérifier » action card.
    --
    -- PARITY (lib/dashboard/rollup.ts:85-90 + :104-106): that card counts
    -- rollups whose `overall.kind === 'info'`, which is reachable ONLY through
    -- `docs === 'review'`, which is `docTemplates.some(state === 'awaiting')` —
    -- and `docTemplates` is `templates.filter(t => t.type === 'document_upload')`.
    -- Hence the type filter below. A submitted `data_entry` form folds into
    -- `forms === 'complete'` on the dashboard and never surfaces as "à vérifier";
    -- without this filter the bell counted it and the two disagreed. Note
    -- lib/forms/insert-standard-template.ts:21 maps BOTH 'online' and 'fillable'
    -- standard forms to data_entry, so that was the common case, not the corner.
    select t.exchange_id, 'submissions_to_review',
           asg.student_id::text, s.submitted_at
      from submissions s
      join assignments asg  on asg.id = s.assignment_id
      join form_templates t on t.id  = asg.template_id
      join exchanges e      on e.id  = t.exchange_id
     where s.status = 'submitted'
       and s.submitted_at is not null
       and t.type = 'document_upload'
       and e.archived_at is null

    union all

    -- Élèves en retard: subject is the STUDENT. Event time is the deadline
    -- itself, so an overdue dossier lights the badge on the day it crosses and
    -- then goes quiet while remaining listed.
    --
    -- PARITY (lib/dashboard/rollup.ts:40-47 + :94-102): the dashboard's `late`
    -- is `due !== null && due < today`, where `due` is the EARLIEST deadline
    -- among templates whose `assignmentState(...) === 'incomplete'`. An earliest
    -- overdue deadline exists exactly when SOME overdue deadline exists, so the
    -- min collapses to the EXISTS below; both types of template count (the
    -- dashboard's `due` loop iterates all `templates`, not just docs).
    --
    -- `assignmentState` returns 'incomplete' for: no assignment cell, a cell
    -- with no submission, 'draft', 'rejected' — and 'awaiting' for 'submitted',
    -- 'done' for 'approved'. So the predicate is `s.id is null or s.status in
    -- ('draft','rejected')`, NOT `s.status <> 'approved'`: the latter admitted
    -- 'submitted', making a dossier handed in on time but not yet reviewed late
    -- in the bell and on time on the dashboard. `submissions.status` is
    -- CHECK-constrained to exactly those four values (20260624000001:84), so the
    -- IN-list is total and the two forms coincide.
    select t.exchange_id, 'late',
           asg.student_id::text, t.deadline::timestamptz
      from assignments asg
      join form_templates t   on t.id = asg.template_id
      join exchanges e        on e.id = t.exchange_id
      left join submissions s on s.assignment_id = asg.id
     where t.deadline is not null
       and t.deadline < current_date
       and (s.id is null or s.status in ('draft', 'rejected'))
       and e.archived_at is null
  ),
  deduped as (
    select i.exchange_id, i.kind, i.subject, max(i.event_at) as event_at
      from items i
     group by i.exchange_id, i.kind, i.subject
  )
  select d.exchange_id,
         d.kind,
         count(*)::int,
         count(*) filter (where d.event_at > (select at from seen))::int,
         max(d.event_at)
    from deduped d
   where (select my_role()) = 'organizer'
   group by d.exchange_id, d.kind
$$;

grant execute on function public.organizer_notifications() to authenticated;
