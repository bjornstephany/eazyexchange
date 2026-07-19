-- Fillable, signable standard forms
-- (spec: docs/superpowers/specs/2026-07-19-fillable-signable-forms-design.md)
-- 1) exchange_program_details: shared per-exchange variables consumed by the
--    code-defined fillable templates (lib/forms/fillable/).
-- 2) submissions: e-signed payload + generated-PDF path.
-- 3) form_templates: admit the new kind 'fillable' (collects structured data).

create table exchange_program_details (
  exchange_id uuid primary key references exchanges(id) on delete cascade,
  destination text,
  travel_start date,
  travel_end date,
  chaperones text[] not null default '{}',
  association_name text,
  sending_school_name text,
  receiving_school_name text,
  proviseur_name text,
  sending_city text,
  absence_dates text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table exchange_program_details enable row level security;

-- Organizers of either participating school manage the row (the details
-- describe the shared trip). Same scoping helper as exchange_enrollments.
create policy "organizers manage program details" on exchange_program_details
  for all
  using (my_role() = 'organizer' and exchange_in_my_school(exchange_id))
  with check (my_role() = 'organizer' and exchange_in_my_school(exchange_id));

-- Enrolled students read the values (their fillable forms render them).
create policy "students read enrolled program details" on exchange_program_details
  for select
  using (exists (
    select 1 from exchange_enrollments en
    where en.exchange_id = exchange_program_details.exchange_id
      and en.user_id = (select auth.uid())
  ));

-- E-signed fillable submissions: answers + signatures JSON, generated PDF path
-- (documents bucket, key <assignment_id>/fillable/<submission_id>.pdf so the
-- existing assignment-scoped storage policies apply unchanged).
alter table submissions
  add column fillable_data jsonb,
  add column generated_pdf_path text;

-- Admit the new kind. Fillable templates collect structured data (data_entry)
-- but have neither form_fields nor document_slots — structure lives in code.
alter table form_templates
  drop constraint form_templates_kind_check,
  add constraint form_templates_kind_check
    check (kind in ('online', 'pdf', 'doc', 'fillable')),
  drop constraint form_templates_kind_type_coherent,
  add constraint form_templates_kind_type_coherent check (
    (kind in ('online', 'fillable') and type = 'data_entry')
    or (kind in ('pdf', 'doc') and type = 'document_upload')
  );
