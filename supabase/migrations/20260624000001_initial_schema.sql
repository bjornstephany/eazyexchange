-- Schools
create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- User profiles (extends auth.users)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references schools(id),
  role text not null check (role in ('organizer', 'student')),
  full_name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

-- Exchanges
create table exchanges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year int not null,
  school_a_id uuid not null references schools(id),
  school_b_id uuid not null references schools(id),
  created_at timestamptz not null default now()
);

-- Exchange enrollments
create table exchange_enrollments (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null references exchanges(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(exchange_id, user_id)
);

-- Form templates
create table form_templates (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null references exchanges(id) on delete cascade,
  school_id uuid not null references schools(id),
  name text not null,
  description text,
  type text not null check (type in ('data_entry', 'document_upload')),
  deadline date not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

-- Form fields (data_entry templates)
create table form_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references form_templates(id) on delete cascade,
  label text not null,
  field_type text not null check (field_type in ('text', 'textarea', 'date', 'checkbox', 'select')),
  options jsonb,
  required boolean not null default true,
  "order" int not null default 0
);

-- Document slots (document_upload templates)
create table document_slots (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references form_templates(id) on delete cascade,
  label text not null,
  description text,
  required boolean not null default true,
  "order" int not null default 0
);

-- Assignments (student ↔ template)
create table assignments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references form_templates(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique(template_id, student_id)
);

-- Submissions
create table submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade unique,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewer_id uuid references users(id),
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Field answers (data_entry submissions)
create table field_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  field_id uuid not null references form_fields(id) on delete cascade,
  value text not null,
  unique(submission_id, field_id)
);

-- Document uploads
create table document_uploads (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  slot_id uuid not null references document_slots(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  uploaded_at timestamptz not null default now(),
  unique(submission_id, slot_id)
);

-- Auto-update submissions.updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger submissions_updated_at before update on submissions
  for each row execute function update_updated_at();
