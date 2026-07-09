-- Perf (audit follow-up, Phase C). Postgres does not index foreign-key columns
-- automatically. Today only primary keys and composite-unique constraints are
-- indexed, and those cover only their *leading* column — e.g. the unique on
-- assignments(template_id, student_id) does not help lookups by student_id, and
-- exchange_enrollments(exchange_id, user_id) does not help lookups by user_id.
-- These indexes back the FK/filter columns used by RLS policies and hot queries.
-- All additive; IF NOT EXISTS keeps the migration idempotent.
create index if not exists users_school_id_idx on users(school_id);
create index if not exists exchanges_school_a_idx on exchanges(school_a_id);
create index if not exists exchanges_school_b_idx on exchanges(school_b_id);
create index if not exists form_templates_exchange_idx on form_templates(exchange_id);
create index if not exists form_templates_school_idx on form_templates(school_id);
create index if not exists form_fields_template_idx on form_fields(template_id);
create index if not exists document_slots_template_idx on document_slots(template_id);
create index if not exists assignments_student_idx on assignments(student_id);
create index if not exists exchange_enrollments_user_idx on exchange_enrollments(user_id);
create index if not exists submissions_reviewer_idx on submissions(reviewer_id);
