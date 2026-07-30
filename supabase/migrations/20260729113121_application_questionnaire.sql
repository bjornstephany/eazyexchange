-- Per-exchange application questionnaire + the cross-school bank of
-- organizer-written questions that feeds the « + » dialog's suggestions.
--
-- Spec: docs/superpowers/specs/2026-07-29-application-template-editor-design.md

-- ---------------------------------------------------------------------------
-- 1. The per-exchange questionnaire.
-- ---------------------------------------------------------------------------
-- NULL means « never customized »: the funnel renders lib/application-form.ts's
-- APPLICATION_SECTIONS unchanged. Every existing exchange keeps working with no
-- backfill, and « Réinitialiser » writes NULL back rather than a copy of the
-- standard structure — one representation for one meaning.
--
-- Built-in questions are stored BY REFERENCE ({"ref":"last_name"}) so their
-- type, label and five translations keep coming from code; custom questions
-- carry their whole monolingual definition inline. Shape:
--   { "version": 1, "sections": [ { "id": "student", "fields": [ … ] }, … ] }
alter table exchanges add column application_fields jsonb;

comment on column exchanges.application_fields is
  'Per-exchange application questionnaire. NULL = the code-defined default. See lib/application-fields.ts.';

-- No new grant: organizers already hold UPDATE on exchanges (they set
-- application_open / deadline through the same request-scoped client), and the
-- existing exchange policies scope that to their own school.

-- ---------------------------------------------------------------------------
-- 2. The cross-school question bank.
-- ---------------------------------------------------------------------------
-- One row per (school, question) the first time an organizer writes it. Its
-- ONLY purpose is the aggregate below: phrasings that at least three
-- INDEPENDENT schools converged on, offered back as one-click suggestions.
--
-- Organizers may INSERT for their own school and have NO SELECT AT ALL — one
-- school must never see another's raw wording. The three-school threshold is
-- also the PII guard: a label containing a student's name will never be
-- written by three schools.
create table application_custom_questions (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  label      text not null check (length(label) between 1 and 120),
  -- GENERATED, not app-written: the SQL and the JS mirror
  -- (normalizeQuestionLabel in lib/application-fields.ts) cannot drift, and the
  -- unique index below cannot be dodged by sending a different value.
  -- Lowercase, every run of non-alphanumerics collapsed to one space, trimmed —
  -- so « Sait nager ? » and « sait nager? » are the same question.
  normalized_label text generated always as (
    btrim(regexp_replace(lower(label), '[^[:alnum:]]+', ' ', 'g'))
  ) stored,
  locale     text not null check (locale in ('en','fr','es','it','de')),
  type       text not null check (type in ('text','textarea','date','yesno','radio')),
  options    jsonb,
  created_at timestamptz not null default now()
);

-- One row per school per phrasing per locale: a school writing the same
-- question on two exchanges must not count twice toward the threshold.
create unique index application_custom_questions_unique
  on application_custom_questions (school_id, normalized_label, locale);

-- The aggregate's scan path, and the school_id FK index the unindexed_fks
-- advisor wants.
create index application_custom_questions_school_idx
  on application_custom_questions (school_id);
create index application_custom_questions_bank_idx
  on application_custom_questions (locale, normalized_label);

alter table application_custom_questions enable row level security;

-- INSERT only, own school only. Non-recursive: references the STABLE
-- my_role()/my_school_id() helpers with (select …) initplan wrappers per
-- 20260705173309.
create policy "organizers bank own school custom questions"
  on application_custom_questions for insert
  with check (
    (select my_role()) = 'organizer'
    and school_id = (select my_school_id())
  );

-- No SELECT / UPDATE / DELETE policy at all. Belt-and-braces beyond "no
-- policy": drop the default grants so a future over-permissive policy cannot
-- re-open the raw rows (same discipline as audit_log / communication_events).
revoke select, update, delete, truncate on application_custom_questions
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The suggestions RPC — the ONLY read path into the bank.
-- ---------------------------------------------------------------------------
-- Returns aggregates, never rows: a phrasing plus how many distinct schools
-- wrote it, and only at three or more. min(label) picks one representative
-- spelling for a normalized group, deterministically.
create or replace function application_question_suggestions(p_locale text)
  returns table (label text, type text, options jsonb, schools bigint)
  language sql stable security definer set search_path = public as $$
    select min(q.label), q.type, q.options, count(distinct q.school_id)
    from application_custom_questions q
    where q.locale = p_locale
    group by q.normalized_label, q.type, q.options
    having count(distinct q.school_id) >= 3
    order by count(distinct q.school_id) desc, min(q.label)
    limit 8;
$$;
revoke execute on function public.application_question_suggestions(text) from public;
grant execute on function public.application_question_suggestions(text) to authenticated;
