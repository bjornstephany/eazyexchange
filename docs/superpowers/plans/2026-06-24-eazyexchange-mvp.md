# EazyExchange MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MVP web app where exchange organizers create form templates and invite students, students fill out forms and upload documents, and organizers review/approve submissions with automated email reminders for incomplete forms.

**Architecture:** Next.js 14 App Router with Supabase for auth/database/storage and Resend for email. Organizers and students have separate route groups with role-based middleware. Server Actions handle all mutations. Supabase RLS enforces data isolation per school.

**Tech Stack:** Next.js 14, Supabase (PostgreSQL + Auth + Storage + Edge Functions), Resend, Tailwind CSS, shadcn/ui, Vitest, TypeScript

## Global Constraints

- Node.js ≥ 20, pnpm as package manager
- Next.js 14 App Router only — no Pages Router
- All database mutations via Server Actions (no separate API routes)
- All tables must have RLS enabled — no table is publicly readable/writable
- TypeScript strict mode throughout
- Form field order controlled by `order` integer column (0-indexed)
- Submission statuses are exactly: `draft | submitted | approved | rejected`
- Form template types are exactly: `data_entry | document_upload`
- User roles are exactly: `organizer | student`

---

## File Map

```
eazyexchange/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx            # Email/password login
│   │   └── accept-invite/page.tsx    # New user sets password on invite
│   ├── (organizer)/
│   │   ├── layout.tsx                # Organizer shell + nav
│   │   ├── dashboard/page.tsx        # List exchanges
│   │   └── exchanges/
│   │       ├── new/page.tsx
│   │       └── [id]/
│   │           ├── page.tsx          # Master grid
│   │           ├── forms/
│   │           │   ├── new/page.tsx
│   │           │   └── [formId]/page.tsx
│   │           ├── students/page.tsx
│   │           └── submissions/[submissionId]/page.tsx
│   ├── (student)/
│   │   ├── layout.tsx                # Student shell + nav
│   │   └── my-forms/
│   │       ├── page.tsx
│   │       └── [assignmentId]/
│   │           ├── page.tsx          # Fill form or upload docs
│   │           └── status/page.tsx
│   ├── layout.tsx                    # Root layout
│   └── page.tsx                      # Redirect based on role
├── components/
│   ├── ui/                           # shadcn/ui primitives (auto-generated)
│   ├── FormBuilder.tsx               # Organizer: add/reorder fields or slots
│   ├── FormRenderer.tsx              # Student: render data-entry fields
│   ├── DocumentUploader.tsx          # Student: upload files per slot
│   ├── MasterGrid.tsx                # Organizer: students × forms status grid
│   ├── StatusBadge.tsx               # Reusable status chip
│   ├── OrganizerNav.tsx
│   └── StudentNav.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # Browser client (createBrowserClient)
│   │   ├── server.ts                 # Server client (createServerClient, cookies)
│   │   └── middleware.ts             # Auth session refresh helper
│   ├── email.ts                      # Resend send helpers
│   └── utils.ts                      # cn() and other shared utils
├── actions/
│   ├── exchanges.ts                  # createExchange, getExchanges
│   ├── forms.ts                      # createTemplate, updateTemplate, getTemplate
│   ├── students.ts                   # inviteStudent, getStudents
│   └── submissions.ts                # saveAnswer, submitForm, reviewSubmission
├── types/
│   └── db.ts                         # Hand-written DB types (tables + enums)
├── supabase/
│   ├── migrations/
│   │   ├── 20260624000001_initial_schema.sql
│   │   └── 20260624000002_rls_policies.sql
│   └── functions/
│       └── send-reminders/
│           └── index.ts
├── middleware.ts                      # Route protection + role redirects
├── vitest.config.ts
└── vitest.setup.ts
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`
- Create: `lib/utils.ts`
- Create: `app/layout.tsx`, `app/page.tsx`
- Create: `.env.local` (from template)
- Create: `vitest.config.ts`, `vitest.setup.ts`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` from `lib/utils.ts`

- [ ] **Step 1: Scaffold Next.js project**

```bash
cd /home/bjorn/eazyexchange
pnpm create next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```

Accept all defaults when prompted.

- [ ] **Step 2: Install core dependencies**

```bash
pnpm add @supabase/supabase-js @supabase/ssr resend
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: Install shadcn/ui**

```bash
pnpm dlx shadcn@latest init
```

When prompted: style = Default, base color = Slate, CSS variables = yes.

Then add the components we need:
```bash
pnpm dlx shadcn@latest add button input label card table badge textarea select dialog
```

- [ ] **Step 4: Create `.env.local`**

```bash
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
RESEND_API_KEY=your_resend_api_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF
```

- [ ] **Step 5: Configure Vitest**

Write `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

Write `vitest.setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 6: Verify `lib/utils.ts` has `cn`**

It should already exist from shadcn init. Confirm it exports:
```typescript
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 7: Write and run a smoke test**

Create `lib/__tests__/utils.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { cn } from '../utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })
  it('resolves tailwind conflicts', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })
})
```

Run: `pnpm vitest run lib/__tests__/utils.test.ts`
Expected: 2 tests pass

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with Supabase, shadcn/ui, and Vitest"
```

---

## Task 2: Supabase Clients & Types

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/middleware.ts`
- Create: `types/db.ts`
- Create: `middleware.ts`

**Interfaces:**
- Produces: `createClient()` (browser) from `lib/supabase/client.ts`
- Produces: `createClient()` (server) from `lib/supabase/server.ts`
- Produces: `updateSession(request)` from `lib/supabase/middleware.ts`
- Produces: DB type `Database` from `types/db.ts`

- [ ] **Step 1: Write browser Supabase client**

Create `lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/db'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Write server Supabase client**

Create `lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/db'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 3: Write session refresh helper**

Create `lib/supabase/middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/db'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  return { supabaseResponse, user, supabase }
}
```

- [ ] **Step 4: Write DB types**

Create `types/db.ts`:
```typescript
export type Role = 'organizer' | 'student'
export type FormType = 'data_entry' | 'document_upload'
export type SubmissionStatus = 'draft' | 'submitted' | 'approved' | 'rejected'
export type FieldType = 'text' | 'textarea' | 'date' | 'checkbox' | 'select'

export interface School { id: string; name: string; created_at: string }
export interface Exchange {
  id: string; name: string; year: number
  school_a_id: string; school_b_id: string; created_at: string
}
export interface UserProfile {
  id: string; school_id: string; role: Role
  full_name: string; email: string; created_at: string
}
export interface ExchangeEnrollment { id: string; exchange_id: string; user_id: string; created_at: string }
export interface FormTemplate {
  id: string; exchange_id: string; school_id: string
  name: string; description: string | null; type: FormType
  deadline: string; created_by: string; created_at: string
}
export interface FormField {
  id: string; template_id: string; label: string
  field_type: FieldType; options: string[] | null
  required: boolean; order: number
}
export interface DocumentSlot {
  id: string; template_id: string; label: string
  description: string | null; required: boolean; order: number
}
export interface Assignment { id: string; template_id: string; student_id: string; assigned_at: string }
export interface Submission {
  id: string; assignment_id: string; status: SubmissionStatus
  submitted_at: string | null; reviewed_at: string | null
  reviewer_id: string | null; review_note: string | null
  created_at: string; updated_at: string
}
export interface FieldAnswer { id: string; submission_id: string; field_id: string; value: string }
export interface DocumentUpload {
  id: string; submission_id: string; slot_id: string
  storage_path: string; file_name: string; uploaded_at: string
}

export interface Database {
  public: {
    Tables: {
      schools: { Row: School; Insert: Omit<School, 'id' | 'created_at'>; Update: Partial<School> }
      exchanges: { Row: Exchange; Insert: Omit<Exchange, 'id' | 'created_at'>; Update: Partial<Exchange> }
      users: { Row: UserProfile; Insert: Omit<UserProfile, 'created_at'>; Update: Partial<UserProfile> }
      exchange_enrollments: { Row: ExchangeEnrollment; Insert: Omit<ExchangeEnrollment, 'id' | 'created_at'>; Update: Partial<ExchangeEnrollment> }
      form_templates: { Row: FormTemplate; Insert: Omit<FormTemplate, 'id' | 'created_at'>; Update: Partial<FormTemplate> }
      form_fields: { Row: FormField; Insert: Omit<FormField, 'id'>; Update: Partial<FormField> }
      document_slots: { Row: DocumentSlot; Insert: Omit<DocumentSlot, 'id'>; Update: Partial<DocumentSlot> }
      assignments: { Row: Assignment; Insert: Omit<Assignment, 'id' | 'assigned_at'>; Update: Partial<Assignment> }
      submissions: { Row: Submission; Insert: Omit<Submission, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Submission> }
      field_answers: { Row: FieldAnswer; Insert: Omit<FieldAnswer, 'id'>; Update: Partial<FieldAnswer> }
      document_uploads: { Row: DocumentUpload; Insert: Omit<DocumentUpload, 'id' | 'uploaded_at'>; Update: Partial<DocumentUpload> }
    }
  }
}
```

- [ ] **Step 5: Write route-protection middleware**

Create `middleware.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/db'

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/accept-invite')

  if (!user && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isAuthRoute) {
    // Fetch role to redirect correctly
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
    )
    const { data: profile } = await supabase
      .from('users').select('role').eq('id', user.id).single()
    const dest = profile?.role === 'organizer' ? '/dashboard' : '/my-forms'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Supabase clients, DB types, and route-protection middleware"
```

---

## Task 3: Database Schema & RLS

**Files:**
- Create: `supabase/migrations/20260624000001_initial_schema.sql`
- Create: `supabase/migrations/20260624000002_rls_policies.sql`

**Interfaces:**
- Produces: all tables described in the Data Model section of plan.md

- [ ] **Step 1: Create Supabase project locally**

```bash
pnpm add -D supabase
pnpm supabase init
```

Link to your remote project:
```bash
pnpm supabase login
pnpm supabase link --project-ref YOUR_PROJECT_REF
```

- [ ] **Step 2: Write initial schema migration**

Create `supabase/migrations/20260624000001_initial_schema.sql`:
```sql
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
```

- [ ] **Step 3: Write RLS policies migration**

Create `supabase/migrations/20260624000002_rls_policies.sql`:
```sql
-- Enable RLS on all tables
alter table schools enable row level security;
alter table users enable row level security;
alter table exchanges enable row level security;
alter table exchange_enrollments enable row level security;
alter table form_templates enable row level security;
alter table form_fields enable row level security;
alter table document_slots enable row level security;
alter table assignments enable row level security;
alter table submissions enable row level security;
alter table field_answers enable row level security;
alter table document_uploads enable row level security;

-- Helper: get current user's school_id
create or replace function my_school_id() returns uuid language sql security definer as $$
  select school_id from users where id = auth.uid()
$$;

-- Helper: get current user's role
create or replace function my_role() returns text language sql security definer as $$
  select role from users where id = auth.uid()
$$;

-- schools: anyone authenticated can read their own school
create policy "users can read their school" on schools for select
  using (id = my_school_id());

-- users: organizers read all users in their school; students read themselves
create policy "organizers read school users" on users for select
  using (my_role() = 'organizer' and school_id = my_school_id());
create policy "students read themselves" on users for select
  using (id = auth.uid());
create policy "users update themselves" on users for update
  using (id = auth.uid());

-- exchanges: organizers in either school can read
create policy "organizers read exchanges" on exchanges for select
  using (my_role() = 'organizer' and (school_a_id = my_school_id() or school_b_id = my_school_id()));
create policy "organizers insert exchanges" on exchanges for insert
  with check (my_role() = 'organizer' and (school_a_id = my_school_id() or school_b_id = my_school_id()));

-- exchange_enrollments
create policy "organizers read enrollments" on exchange_enrollments for select
  using (my_role() = 'organizer');
create policy "students read own enrollment" on exchange_enrollments for select
  using (user_id = auth.uid());
create policy "organizers insert enrollments" on exchange_enrollments for insert
  with check (my_role() = 'organizer');

-- form_templates: organizers from the template's school; enrolled students
create policy "organizers manage their templates" on form_templates for all
  using (my_role() = 'organizer' and school_id = my_school_id());
create policy "students read assigned templates" on form_templates for select
  using (
    my_role() = 'student' and
    exists (
      select 1 from assignments a where a.template_id = form_templates.id and a.student_id = auth.uid()
    )
  );

-- form_fields
create policy "organizers manage fields" on form_fields for all
  using (exists (select 1 from form_templates ft where ft.id = form_fields.template_id and ft.school_id = my_school_id()));
create policy "students read fields for assigned templates" on form_fields for select
  using (exists (select 1 from assignments a where a.template_id = form_fields.template_id and a.student_id = auth.uid()));

-- document_slots (same pattern as form_fields)
create policy "organizers manage slots" on document_slots for all
  using (exists (select 1 from form_templates ft where ft.id = document_slots.template_id and ft.school_id = my_school_id()));
create policy "students read slots for assigned templates" on document_slots for select
  using (exists (select 1 from assignments a where a.template_id = document_slots.template_id and a.student_id = auth.uid()));

-- assignments
create policy "organizers manage assignments" on assignments for all
  using (exists (select 1 from form_templates ft where ft.id = assignments.template_id and ft.school_id = my_school_id()));
create policy "students read own assignments" on assignments for select
  using (student_id = auth.uid());

-- submissions
create policy "organizers read school submissions" on submissions for select
  using (my_role() = 'organizer' and exists (
    select 1 from assignments a
    join form_templates ft on ft.id = a.template_id
    where a.id = submissions.assignment_id and ft.school_id = my_school_id()
  ));
create policy "organizers update submission status" on submissions for update
  using (my_role() = 'organizer' and exists (
    select 1 from assignments a
    join form_templates ft on ft.id = a.template_id
    where a.id = submissions.assignment_id and ft.school_id = my_school_id()
  ));
create policy "students manage own submissions" on submissions for all
  using (exists (select 1 from assignments a where a.id = submissions.assignment_id and a.student_id = auth.uid()));

-- field_answers
create policy "organizers read answers" on field_answers for select
  using (my_role() = 'organizer' and exists (
    select 1 from submissions s join assignments a on a.id = s.assignment_id
    join form_templates ft on ft.id = a.template_id
    where s.id = field_answers.submission_id and ft.school_id = my_school_id()
  ));
create policy "students manage own answers" on field_answers for all
  using (exists (
    select 1 from submissions s join assignments a on a.id = s.assignment_id
    where s.id = field_answers.submission_id and a.student_id = auth.uid()
  ));

-- document_uploads (same pattern as field_answers)
create policy "organizers read uploads" on document_uploads for select
  using (my_role() = 'organizer' and exists (
    select 1 from submissions s join assignments a on a.id = s.assignment_id
    join form_templates ft on ft.id = a.template_id
    where s.id = document_uploads.submission_id and ft.school_id = my_school_id()
  ));
create policy "students manage own uploads" on document_uploads for all
  using (exists (
    select 1 from submissions s join assignments a on a.id = s.assignment_id
    where s.id = document_uploads.submission_id and a.student_id = auth.uid()
  ));
```

- [ ] **Step 4: Apply migrations**

```bash
pnpm supabase db push
```

Expected: migrations apply without errors.

- [ ] **Step 5: Create Supabase Storage bucket**

In the Supabase dashboard → Storage → New bucket:
- Name: `documents`
- Public: No (private)

Or via CLI:
```bash
pnpm supabase storage create documents --no-public
```

- [ ] **Step 6: Add storage RLS policy**

In Supabase dashboard → Storage → Policies, add for `documents` bucket:

```sql
-- Students can upload to their own submission folder
create policy "students upload own docs" on storage.objects for insert
  with check (
    bucket_id = 'documents' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Students can read their own uploads
create policy "students read own docs" on storage.objects for select
  using (
    bucket_id = 'documents' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Organizers can read docs from their school's submissions
-- (Simplified: organizers read all — tighten post-MVP if needed)
create policy "organizers read docs" on storage.objects for select
  using (bucket_id = 'documents' and my_role() = 'organizer');
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add database schema migrations and RLS policies"
```

---

## Task 4: Auth Pages & Onboarding

**Files:**
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/accept-invite/page.tsx`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `lib/supabase/client.ts` and `lib/supabase/server.ts`
- Produces: authenticated session; `users` profile row created on first login

- [ ] **Step 1: Write root layout**

Create `app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'EazyExchange',
  description: 'Student exchange form management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Write root redirect page**

Create `app/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  redirect(profile?.role === 'organizer' ? '/dashboard' : '/my-forms')
}
```

- [ ] **Step 3: Write login page**

Create `app/(auth)/login/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to EazyExchange</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email}
                onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password}
                onChange={e => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Write accept-invite page**

This page is where a newly invited student sets their full name and password.

Create `app/(auth)/accept-invite/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AcceptInvitePage() {
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Update password (Supabase handles token from URL hash automatically)
    const { data: { user }, error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError || !user) { setError(updateError?.message ?? 'Error'); setLoading(false); return }

    // Upsert profile (school_id was set by organizer invite action)
    const { error: profileError } = await supabase
      .from('users')
      .update({ full_name: fullName })
      .eq('id', user.id)
    if (profileError) { setError(profileError.message); setLoading(false); return }

    router.push('/my-forms')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set up your account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAccept} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={fullName}
                onChange={e => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Choose a password</Label>
              <Input id="password" type="password" value={password}
                onChange={e => setPassword(e.target.value)} required minLength={8} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Setting up…' : 'Get started'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 5: Manual smoke test**

```bash
pnpm dev
```

Open http://localhost:3000 — should redirect to /login. The login form should render. No console errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add login and accept-invite auth pages"
```

---

## Task 5: Organizer Shell & Exchange Management

**Files:**
- Create: `app/(organizer)/layout.tsx`
- Create: `components/OrganizerNav.tsx`
- Create: `app/(organizer)/dashboard/page.tsx`
- Create: `app/(organizer)/exchanges/new/page.tsx`
- Create: `actions/exchanges.ts`

**Interfaces:**
- Produces: `createExchange(name, year, schoolBName)` server action
- Produces: `getExchanges()` server action

- [ ] **Step 1: Write exchange server actions**

Create `actions/exchanges.ts`:
```typescript
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getExchanges() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('users').select('school_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')

  const { data, error } = await supabase
    .from('exchanges')
    .select('*, school_a:schools!school_a_id(name), school_b:schools!school_b_id(name)')
    .or(`school_a_id.eq.${profile.school_id},school_b_id.eq.${profile.school_id}`)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function createExchange(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('users').select('school_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')

  const name = formData.get('name') as string
  const year = parseInt(formData.get('year') as string)
  const schoolBName = formData.get('school_b_name') as string

  // Upsert school B by name
  const { data: schoolB, error: schoolError } = await supabase
    .from('schools')
    .upsert({ name: schoolBName }, { onConflict: 'name' })
    .select('id').single()
  if (schoolError) throw schoolError

  const { error } = await supabase.from('exchanges').insert({
    name, year,
    school_a_id: profile.school_id,
    school_b_id: schoolB.id,
  })
  if (error) throw error
  revalidatePath('/dashboard')
}
```

- [ ] **Step 2: Write organizer nav**

Create `components/OrganizerNav.tsx`:
```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function OrganizerNav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="border-b bg-white px-6 py-3 flex items-center gap-6">
      <span className="font-semibold text-slate-900">EazyExchange</span>
      <Link href="/dashboard"
        className={cn('text-sm', pathname === '/dashboard' ? 'text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-900')}>
        Exchanges
      </Link>
      <div className="ml-auto">
        <Button variant="ghost" size="sm" onClick={handleSignOut}>Sign out</Button>
      </div>
    </nav>
  )
}
```

- [ ] **Step 3: Write organizer layout**

Create `app/(organizer)/layout.tsx`:
```tsx
import { OrganizerNav } from '@/components/OrganizerNav'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'organizer') redirect('/my-forms')

  return (
    <div className="min-h-screen bg-slate-50">
      <OrganizerNav />
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: Write dashboard page**

Create `app/(organizer)/dashboard/page.tsx`:
```tsx
import { getExchanges } from '@/actions/exchanges'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function DashboardPage() {
  const exchanges = await getExchanges()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Exchanges</h1>
        <Button asChild><Link href="/exchanges/new">New exchange</Link></Button>
      </div>
      {exchanges.length === 0 && (
        <p className="text-slate-500">No exchanges yet. Create your first one.</p>
      )}
      <div className="grid gap-4">
        {exchanges.map(ex => (
          <Card key={ex.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{ex.name}</CardTitle>
                <Badge variant="outline">{ex.year}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-500">
                {(ex.school_a as any)?.name} ↔ {(ex.school_b as any)?.name}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href={`/exchanges/${ex.id}`}>View →</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Write new exchange page**

Create `app/(organizer)/exchanges/new/page.tsx`:
```tsx
'use client'
import { createExchange } from '@/actions/exchanges'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useState } from 'react'

export default function NewExchangePage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await createExchange(new FormData(e.currentTarget))
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader><CardTitle>New exchange</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Exchange name</Label>
            <Input id="name" name="name" placeholder="France–Canada 2026" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="year">Year</Label>
            <Input id="year" name="year" type="number" defaultValue={new Date().getFullYear()} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="school_b_name">Partner school name</Label>
            <Input id="school_b_name" name="school_b_name" placeholder="Lycée Victor Hugo" required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create exchange'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 6: Seed a test organizer in Supabase**

In Supabase dashboard → Authentication → Users → Invite user:
- Email: `organizer@test.com`

Then in the SQL editor, create the school and profile:
```sql
insert into schools (name) values ('Lincoln High') returning id;
-- Copy the returned id, then:
insert into users (id, school_id, role, full_name, email)
values (
  '<auth_user_id_from_dashboard>',
  '<school_id_from_above>',
  'organizer',
  'Test Organizer',
  'organizer@test.com'
);
```

- [ ] **Step 7: Manual test**

Sign in as organizer → Dashboard shows empty state → Create an exchange → Exchange appears in list → Click View shows `/exchanges/[id]` (404 for now, that's fine).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add organizer dashboard and exchange creation"
```

---

## Task 6: Form Template Builder

**Files:**
- Create: `components/FormBuilder.tsx`
- Create: `app/(organizer)/exchanges/[id]/forms/new/page.tsx`
- Create: `app/(organizer)/exchanges/[id]/forms/[formId]/page.tsx`
- Create: `actions/forms.ts`

**Interfaces:**
- Consumes: exchange `id` from URL params
- Produces: `createTemplate(exchangeId, formData)`, `getTemplate(id)`, `addField(templateId, field)`, `removeField(fieldId)`, `addSlot(templateId, slot)`, `removeSlot(slotId)` server actions

- [ ] **Step 1: Write form server actions**

Create `actions/forms.ts`:
```typescript
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { FieldType, FormType } from '@/types/db'

export async function createTemplate(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('users').select('school_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')

  const exchangeId = formData.get('exchange_id') as string
  const name = formData.get('name') as string
  const description = formData.get('description') as string | null
  const type = formData.get('type') as FormType
  const deadline = formData.get('deadline') as string

  const { data, error } = await supabase.from('form_templates').insert({
    exchange_id: exchangeId,
    school_id: profile.school_id,
    name, description: description || null, type, deadline,
    created_by: user.id,
  }).select('id').single()
  if (error) throw error
  revalidatePath(`/exchanges/${exchangeId}`)
  return data.id
}

export async function getTemplate(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('form_templates')
    .select('*, form_fields(* order by order asc), document_slots(* order by order asc)')
    .eq('id', id).single()
  if (error) throw error
  return data
}

export async function addField(templateId: string, label: string, fieldType: FieldType, required: boolean, options?: string[]) {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('form_fields').select('order').eq('template_id', templateId).order('order', { ascending: false }).limit(1).single()
  const nextOrder = (existing?.order ?? -1) + 1
  const { error } = await supabase.from('form_fields').insert({
    template_id: templateId, label, field_type: fieldType,
    required, options: options ?? null, order: nextOrder,
  })
  if (error) throw error
  revalidatePath(`/exchanges`)
}

export async function removeField(fieldId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('form_fields').delete().eq('id', fieldId)
  if (error) throw error
  revalidatePath(`/exchanges`)
}

export async function addSlot(templateId: string, label: string, description: string | null, required: boolean) {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('document_slots').select('order').eq('template_id', templateId).order('order', { ascending: false }).limit(1).single()
  const nextOrder = (existing?.order ?? -1) + 1
  const { error } = await supabase.from('document_slots').insert({
    template_id: templateId, label, description: description || null, required, order: nextOrder,
  })
  if (error) throw error
  revalidatePath(`/exchanges`)
}

export async function removeSlot(slotId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('document_slots').delete().eq('id', slotId)
  if (error) throw error
  revalidatePath(`/exchanges`)
}
```

- [ ] **Step 2: Write FormBuilder component**

Create `components/FormBuilder.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { addField, addSlot, removeField, removeSlot } from '@/actions/forms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { FormField, DocumentSlot, FieldType } from '@/types/db'

interface Props {
  templateId: string
  type: 'data_entry' | 'document_upload'
  fields: FormField[]
  slots: DocumentSlot[]
}

export function FormBuilder({ templateId, type, fields, slots }: Props) {
  const [label, setLabel] = useState('')
  const [fieldType, setFieldType] = useState<FieldType>('text')
  const [description, setDescription] = useState('')
  const [required, setRequired] = useState(true)
  const [loading, setLoading] = useState(false)

  async function handleAddField() {
    if (!label.trim()) return
    setLoading(true)
    await addField(templateId, label, fieldType, required)
    setLabel(''); setLoading(false)
  }

  async function handleAddSlot() {
    if (!label.trim()) return
    setLoading(true)
    await addSlot(templateId, label, description || null, required)
    setLabel(''); setDescription(''); setLoading(false)
  }

  return (
    <div className="space-y-6">
      {type === 'data_entry' && (
        <div>
          <h3 className="font-medium mb-3">Fields ({fields.length})</h3>
          <ul className="space-y-2 mb-4">
            {fields.map(f => (
              <li key={f.id} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded text-sm">
                <span>{f.label} <span className="text-slate-400">({f.field_type}){f.required ? ' *' : ''}</span></span>
                <button onClick={() => removeField(f.id)} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label>Label</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Emergency contact name" />
            </div>
            <div className="w-32 space-y-1">
              <Label>Type</Label>
              <Select value={fieldType} onValueChange={v => setFieldType(v as FieldType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['text','textarea','date','checkbox','select'] as FieldType[]).map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddField} disabled={loading}>Add field</Button>
          </div>
        </div>
      )}

      {type === 'document_upload' && (
        <div>
          <h3 className="font-medium mb-3">Document slots ({slots.length})</h3>
          <ul className="space-y-2 mb-4">
            {slots.map(s => (
              <li key={s.id} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded text-sm">
                <span>{s.label}{s.required ? ' *' : ''}</span>
                <button onClick={() => removeSlot(s.id)} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label>Slot name</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Passport copy" />
            </div>
            <div className="flex-1 space-y-1">
              <Label>Description (optional)</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Clear scan of photo page" />
            </div>
            <Button onClick={handleAddSlot} disabled={loading}>Add slot</Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Write new form template page**

Create `app/(organizer)/exchanges/[id]/forms/new/page.tsx`:
```tsx
'use client'
import { createTemplate } from '@/actions/forms'
import { useRouter, useParams } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function NewFormPage() {
  const { id: exchangeId } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('exchange_id', exchangeId)
      const templateId = await createTemplate(fd)
      router.push(`/exchanges/${exchangeId}/forms/${templateId}`)
    } catch (err: any) {
      setError(err.message); setLoading(false)
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader><CardTitle>New form template</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Form name</Label>
            <Input id="name" name="name" placeholder="Medical information" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea id="description" name="description" rows={2} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="type">Type</Label>
            <Select name="type" defaultValue="data_entry" required>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="data_entry">Data entry form</SelectItem>
                <SelectItem value="document_upload">Document upload</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="deadline">Deadline</Label>
            <Input id="deadline" name="deadline" type="date" required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create & add fields'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Write form template edit page**

Create `app/(organizer)/exchanges/[id]/forms/[formId]/page.tsx`:
```tsx
import { getTemplate } from '@/actions/forms'
import { FormBuilder } from '@/components/FormBuilder'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { notFound } from 'next/navigation'

export default async function FormTemplatePage({ params }: { params: { id: string; formId: string } }) {
  let template
  try { template = await getTemplate(params.formId) }
  catch { notFound() }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold">{template.name}</h1>
        <Badge>{template.type === 'data_entry' ? 'Data entry' : 'Document upload'}</Badge>
        <span className="text-sm text-slate-500">Deadline: {template.deadline}</span>
      </div>
      <Card>
        <CardContent className="pt-6">
          <FormBuilder
            templateId={template.id}
            type={template.type}
            fields={(template as any).form_fields ?? []}
            slots={(template as any).document_slots ?? []}
          />
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 5: Manual test**

Sign in as organizer → go to an exchange → click "New form" → fill in form details → redirected to field editor → add a few fields/slots → fields appear in list → remove one → it disappears.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add form template builder with fields and document slots"
```

---

## Task 7: Student Invite & Master Grid

**Files:**
- Create: `app/(organizer)/exchanges/[id]/page.tsx`
- Create: `app/(organizer)/exchanges/[id]/students/page.tsx`
- Create: `components/MasterGrid.tsx`
- Create: `components/StatusBadge.tsx`
- Create: `actions/students.ts`

**Interfaces:**
- Produces: `inviteStudent(exchangeId, email)` server action
- Produces: `getExchangeStudents(exchangeId)` server action
- Produces: `getMasterGridData(exchangeId)` server action

- [ ] **Step 1: Write student server actions**

Create `actions/students.ts`:
```typescript
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function inviteStudent(exchangeId: string, email: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('users').select('school_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')

  // Create Supabase auth invite
  const { createClient: createAdminClient } = await import('@supabase/supabase-js')
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite`,
  })
  if (inviteError) throw inviteError

  // Create user profile (student, same school as organizer)
  await adminClient.from('users').upsert({
    id: invited.user.id,
    school_id: profile.school_id,
    role: 'student',
    full_name: '',
    email,
  }, { onConflict: 'id' })

  // Enroll in exchange
  await supabase.from('exchange_enrollments').upsert({
    exchange_id: exchangeId,
    user_id: invited.user.id,
  }, { onConflict: 'exchange_id,user_id' })

  // Assign all existing templates for this school to the student
  const { data: templates } = await supabase
    .from('form_templates')
    .select('id')
    .eq('exchange_id', exchangeId)
    .eq('school_id', profile.school_id)

  if (templates?.length) {
    await supabase.from('assignments').upsert(
      templates.map(t => ({ template_id: t.id, student_id: invited.user.id })),
      { onConflict: 'template_id,student_id' }
    )
  }

  revalidatePath(`/exchanges/${exchangeId}`)
}

export async function getMasterGridData(exchangeId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('users').select('school_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')

  // Get students enrolled in this exchange from organizer's school
  const { data: enrollments } = await supabase
    .from('exchange_enrollments')
    .select('users!inner(id, full_name, email)')
    .eq('exchange_id', exchangeId)

  const students = (enrollments ?? [])
    .map(e => (e.users as any))
    .filter((u: any) => u)

  // Get templates for this school
  const { data: templates } = await supabase
    .from('form_templates')
    .select('id, name, deadline, type')
    .eq('exchange_id', exchangeId)
    .eq('school_id', profile.school_id)
    .order('created_at')

  // Get all assignments and their submissions
  const { data: assignments } = await supabase
    .from('assignments')
    .select('id, template_id, student_id, submissions(status)')
    .in('template_id', (templates ?? []).map(t => t.id))

  // Build status map: studentId → templateId → status
  const statusMap: Record<string, Record<string, string>> = {}
  const assignmentMap: Record<string, Record<string, string>> = {}
  for (const a of assignments ?? []) {
    if (!statusMap[a.student_id]) statusMap[a.student_id] = {}
    if (!assignmentMap[a.student_id]) assignmentMap[a.student_id] = {}
    const sub = (a.submissions as any)?.[0]
    statusMap[a.student_id][a.template_id] = sub?.status ?? 'not_started'
    assignmentMap[a.student_id][a.template_id] = a.id
  }

  return { students, templates: templates ?? [], statusMap, assignmentMap }
}
```

- [ ] **Step 2: Write StatusBadge component**

Create `components/StatusBadge.tsx`:
```tsx
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const config: Record<string, { label: string; className: string }> = {
  not_started: { label: 'Not started', className: 'bg-slate-100 text-slate-600' },
  draft:        { label: 'Draft',       className: 'bg-yellow-100 text-yellow-700' },
  submitted:    { label: 'Submitted',   className: 'bg-blue-100 text-blue-700' },
  approved:     { label: 'Approved',    className: 'bg-green-100 text-green-700' },
  rejected:     { label: 'Rejected',    className: 'bg-red-100 text-red-700' },
}

export function StatusBadge({ status }: { status: string }) {
  const c = config[status] ?? config.not_started
  return <Badge className={cn('text-xs font-medium', c.className)}>{c.label}</Badge>
}
```

- [ ] **Step 3: Write MasterGrid component**

Create `components/MasterGrid.tsx`:
```tsx
import Link from 'next/link'
import { StatusBadge } from './StatusBadge'

interface Props {
  exchangeId: string
  students: Array<{ id: string; full_name: string; email: string }>
  templates: Array<{ id: string; name: string; deadline: string }>
  statusMap: Record<string, Record<string, string>>
  assignmentMap: Record<string, Record<string, string>>
}

export function MasterGrid({ exchangeId, students, templates, statusMap, assignmentMap }: Props) {
  if (students.length === 0) {
    return <p className="text-slate-500">No students invited yet.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left py-2 px-3 border-b font-medium text-slate-700 min-w-[160px]">Student</th>
            {templates.map(t => (
              <th key={t.id} className="text-left py-2 px-3 border-b font-medium text-slate-700 min-w-[140px]">
                <div>{t.name}</div>
                <div className="text-xs text-slate-400 font-normal">Due {t.deadline}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map(s => (
            <tr key={s.id} className="hover:bg-slate-50">
              <td className="py-2 px-3 border-b">
                <div className="font-medium">{s.full_name || '—'}</div>
                <div className="text-xs text-slate-400">{s.email}</div>
              </td>
              {templates.map(t => {
                const status = statusMap[s.id]?.[t.id] ?? 'not_started'
                const assignmentId = assignmentMap[s.id]?.[t.id]
                return (
                  <td key={t.id} className="py-2 px-3 border-b">
                    {assignmentId && status === 'submitted' ? (
                      <Link href={`/exchanges/${exchangeId}/submissions/${assignmentId}`}>
                        <StatusBadge status={status} />
                      </Link>
                    ) : (
                      <StatusBadge status={status} />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Write exchange detail page (master grid)**

Create `app/(organizer)/exchanges/[id]/page.tsx`:
```tsx
import { getMasterGridData } from '@/actions/students'
import { MasterGrid } from '@/components/MasterGrid'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export default async function ExchangeDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: exchange } = await supabase
    .from('exchanges')
    .select('name, year')
    .eq('id', params.id).single()
  if (!exchange) notFound()

  const { students, templates, statusMap, assignmentMap } = await getMasterGridData(params.id)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{exchange.name}</h1>
          <p className="text-slate-500 text-sm">{exchange.year}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/exchanges/${params.id}/students`}>Invite students</Link>
          </Button>
          <Button asChild>
            <Link href={`/exchanges/${params.id}/forms/new`}>Add form</Link>
          </Button>
        </div>
      </div>
      <MasterGrid
        exchangeId={params.id}
        students={students}
        templates={templates}
        statusMap={statusMap}
        assignmentMap={assignmentMap}
      />
    </div>
  )
}
```

- [ ] **Step 5: Write students invite page**

Create `app/(organizer)/exchanges/[id]/students/page.tsx`:
```tsx
'use client'
import { inviteStudent } from '@/actions/students'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function StudentsPage() {
  const { id: exchangeId } = useParams<{ id: string }>()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      await inviteStudent(exchangeId, email)
      setMessage({ type: 'success', text: `Invite sent to ${email}` })
      setEmail('')
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    }
    setLoading(false)
  }

  return (
    <Card className="max-w-md">
      <CardHeader><CardTitle>Invite a student</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleInvite} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">Student or parent email</Label>
            <Input id="email" type="email" value={email}
              onChange={e => setEmail(e.target.value)} required />
          </div>
          {message && (
            <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {message.text}
            </p>
          )}
          <Button type="submit" disabled={loading}>
            {loading ? 'Sending…' : 'Send invite'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 6: Manual test**

Sign in as organizer → Exchange detail → "Invite students" → enter an email → invite sent → go back to exchange grid → student row appears → status shows "Not started" for all forms.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add student invite flow and master status grid"
```

---

## Task 8: Student Shell & Form Checklist

**Files:**
- Create: `app/(student)/layout.tsx`
- Create: `components/StudentNav.tsx`
- Create: `app/(student)/my-forms/page.tsx`

**Interfaces:**
- Produces: `getMyAssignments()` server action

- [ ] **Step 1: Add getMyAssignments to actions**

Append to `actions/submissions.ts` (create file):
```typescript
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getMyAssignments() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data, error } = await supabase
    .from('assignments')
    .select(`
      id,
      form_templates!inner(id, name, deadline, type, description),
      submissions(id, status, review_note)
    `)
    .eq('student_id', user.id)
    .order('assigned_at')

  if (error) throw error
  return (data ?? []).map(a => ({
    assignmentId: a.id,
    template: (a.form_templates as any),
    submission: (a.submissions as any)?.[0] ?? null,
  }))
}
```

- [ ] **Step 2: Write StudentNav**

Create `components/StudentNav.tsx`:
```tsx
'use client'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function StudentNav() {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="border-b bg-white px-6 py-3 flex items-center gap-6">
      <span className="font-semibold text-slate-900">EazyExchange</span>
      <Link href="/my-forms" className="text-sm text-slate-500 hover:text-slate-900">My forms</Link>
      <div className="ml-auto">
        <Button variant="ghost" size="sm" onClick={handleSignOut}>Sign out</Button>
      </div>
    </nav>
  )
}
```

- [ ] **Step 3: Write student layout**

Create `app/(student)/layout.tsx`:
```tsx
import { StudentNav } from '@/components/StudentNav'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'student') redirect('/dashboard')

  return (
    <div className="min-h-screen bg-slate-50">
      <StudentNav />
      <main className="max-w-3xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: Write my-forms checklist page**

Create `app/(student)/my-forms/page.tsx`:
```tsx
import { getMyAssignments } from '@/actions/submissions'
import Link from 'next/link'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default async function MyFormsPage() {
  const assignments = await getMyAssignments()

  const incomplete = assignments.filter(a => a.submission?.status !== 'approved')
  const complete = assignments.filter(a => a.submission?.status === 'approved')

  function FormRow({ a }: { a: typeof assignments[0] }) {
    const status = a.submission?.status ?? 'not_started'
    const isRejected = status === 'rejected'
    return (
      <Card>
        <CardContent className="py-4 flex items-center justify-between">
          <div>
            <p className="font-medium">{a.template.name}</p>
            <p className="text-xs text-slate-400">Due {a.template.deadline}</p>
            {isRejected && a.submission?.review_note && (
              <p className="text-xs text-red-600 mt-1">Rejected: {a.submission.review_note}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={status} />
            {status !== 'submitted' && status !== 'approved' && (
              <Button asChild size="sm">
                <Link href={`/my-forms/${a.assignmentId}`}>
                  {isRejected ? 'Resubmit' : 'Fill out'}
                </Link>
              </Button>
            )}
            {status === 'submitted' && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/my-forms/${a.assignmentId}/status`}>View</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">My forms</h1>
      {assignments.length === 0 && <p className="text-slate-500">No forms assigned yet.</p>}
      {incomplete.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">To complete</h2>
          <div className="space-y-2">{incomplete.map(a => <FormRow key={a.assignmentId} a={a} />)}</div>
        </div>
      )}
      {complete.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Completed</h2>
          <div className="space-y-2 opacity-60">{complete.map(a => <FormRow key={a.assignmentId} a={a} />)}</div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Manual test**

Accept invite as student → land on `/my-forms` → forms assigned by organizer appear in list → each has a deadline and "Fill out" button.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add student shell, nav, and form checklist"
```

---

## Task 9: Form Fill & Document Upload Pages

**Files:**
- Create: `components/FormRenderer.tsx`
- Create: `components/DocumentUploader.tsx`
- Create: `app/(student)/my-forms/[assignmentId]/page.tsx`
- Create: `app/(student)/my-forms/[assignmentId]/status/page.tsx`
- Modify: `actions/submissions.ts`

**Interfaces:**
- Consumes: `getMyAssignments()`, template fields/slots via `getAssignmentDetail(assignmentId)`
- Produces: `getAssignmentDetail(id)`, `saveAnswers(assignmentId, answers)`, `submitAssignment(assignmentId)`, `uploadDocument(assignmentId, slotId, file)`

- [ ] **Step 1: Add submission actions**

Append to `actions/submissions.ts`:
```typescript
export async function getAssignmentDetail(assignmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data, error } = await supabase
    .from('assignments')
    .select(`
      id, student_id,
      form_templates!inner(id, name, deadline, type, description,
        form_fields(id, label, field_type, options, required, order),
        document_slots(id, label, description, required, order)
      ),
      submissions(id, status, review_note,
        field_answers(field_id, value),
        document_uploads(slot_id, file_name, storage_path)
      )
    `)
    .eq('id', assignmentId)
    .eq('student_id', user.id)
    .single()

  if (error) throw error
  return data
}

export async function saveAnswers(assignmentId: string, answers: Record<string, string>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  // Get or create submission
  let submission = (await supabase
    .from('submissions').select('id').eq('assignment_id', assignmentId).single()).data

  if (!submission) {
    const { data, error } = await supabase
      .from('submissions').insert({ assignment_id: assignmentId, status: 'draft' }).select('id').single()
    if (error) throw error
    submission = data
  }

  // Upsert answers
  const upserts = Object.entries(answers).map(([field_id, value]) => ({
    submission_id: submission!.id, field_id, value,
  }))
  if (upserts.length) {
    const { error } = await supabase.from('field_answers')
      .upsert(upserts, { onConflict: 'submission_id,field_id' })
    if (error) throw error
  }

  revalidatePath(`/my-forms/${assignmentId}`)
}

export async function submitAssignment(assignmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: submission } = await supabase
    .from('submissions').select('id').eq('assignment_id', assignmentId).single()

  if (!submission) throw new Error('No submission found — save first')

  const { error } = await supabase
    .from('submissions')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', submission.id)
  if (error) throw error
  revalidatePath(`/my-forms`)
}
```

- [ ] **Step 2: Write FormRenderer component**

Create `components/FormRenderer.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { saveAnswers, submitAssignment } from '@/actions/submissions'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { FormField } from '@/types/db'

interface Props {
  assignmentId: string
  fields: FormField[]
  savedAnswers: Record<string, string>
  isResubmit?: boolean
}

export function FormRenderer({ assignmentId, fields, savedAnswers, isResubmit }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>(savedAnswers)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function set(fieldId: string, value: string) {
    setAnswers(prev => ({ ...prev, [fieldId]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try { await saveAnswers(assignmentId, answers) }
    catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      await saveAnswers(assignmentId, answers)
      await submitAssignment(assignmentId)
      router.push('/my-forms')
    } catch (e: any) { setError(e.message); setSubmitting(false) }
  }

  const sortedFields = [...fields].sort((a, b) => a.order - b.order)

  return (
    <div className="space-y-5">
      {sortedFields.map(f => (
        <div key={f.id} className="space-y-1">
          <Label htmlFor={f.id}>{f.label}{f.required && <span className="text-red-500 ml-1">*</span>}</Label>
          {f.field_type === 'text' && (
            <Input id={f.id} value={answers[f.id] ?? ''} onChange={e => set(f.id, e.target.value)} />
          )}
          {f.field_type === 'textarea' && (
            <Textarea id={f.id} value={answers[f.id] ?? ''} onChange={e => set(f.id, e.target.value)} rows={3} />
          )}
          {f.field_type === 'date' && (
            <Input id={f.id} type="date" value={answers[f.id] ?? ''} onChange={e => set(f.id, e.target.value)} />
          )}
          {f.field_type === 'checkbox' && (
            <Checkbox id={f.id} checked={answers[f.id] === 'true'}
              onCheckedChange={v => set(f.id, v ? 'true' : 'false')} />
          )}
          {f.field_type === 'select' && (
            <Select value={answers[f.id] ?? ''} onValueChange={v => set(f.id, v)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {(f.options ?? []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save draft'}
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Submitting…' : isResubmit ? 'Resubmit' : 'Submit'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write DocumentUploader component**

Create `components/DocumentUploader.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { submitAssignment } from '@/actions/submissions'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { DocumentSlot } from '@/types/db'

interface Props {
  assignmentId: string
  submissionId: string | null
  slots: DocumentSlot[]
  uploaded: Record<string, { file_name: string }>
  isResubmit?: boolean
}

export function DocumentUploader({ assignmentId, submissionId, slots, uploaded, isResubmit }: Props) {
  const [files, setFiles] = useState<Record<string, File>>({})
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      // Upload any new files
      for (const [slotId, file] of Object.entries(files)) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Unauthenticated')
        const path = `${user.id}/${assignmentId}/${slotId}/${file.name}`
        const { error: uploadError } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
        if (uploadError) throw uploadError

        // Record in DB via server action
        const { recordUpload } = await import('@/actions/submissions')
        await recordUpload(assignmentId, slotId, path, file.name)
      }
      await submitAssignment(assignmentId)
      router.push('/my-forms')
    } catch (e: any) { setError(e.message); setSubmitting(false) }
  }

  const sortedSlots = [...slots].sort((a, b) => a.order - b.order)

  return (
    <div className="space-y-5">
      {sortedSlots.map(s => (
        <div key={s.id} className="space-y-1">
          <Label>{s.label}{s.required && <span className="text-red-500 ml-1">*</span>}</Label>
          {s.description && <p className="text-xs text-slate-500">{s.description}</p>}
          {uploaded[s.id] && (
            <p className="text-xs text-green-600">Uploaded: {uploaded[s.id].file_name}</p>
          )}
          <input type="file" className="text-sm"
            onChange={e => { if (e.target.files?.[0]) setFiles(prev => ({ ...prev, [s.id]: e.target.files![0] })) }} />
        </div>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Submitting…' : isResubmit ? 'Resubmit' : 'Submit'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Add recordUpload action**

Append to `actions/submissions.ts`:
```typescript
export async function recordUpload(assignmentId: string, slotId: string, storagePath: string, fileName: string) {
  const supabase = await createClient()

  let submission = (await supabase
    .from('submissions').select('id').eq('assignment_id', assignmentId).single()).data

  if (!submission) {
    const { data, error } = await supabase
      .from('submissions').insert({ assignment_id: assignmentId, status: 'draft' }).select('id').single()
    if (error) throw error
    submission = data
  }

  const { error } = await supabase.from('document_uploads')
    .upsert({ submission_id: submission.id, slot_id: slotId, storage_path: storagePath, file_name: fileName },
      { onConflict: 'submission_id,slot_id' })
  if (error) throw error
  revalidatePath(`/my-forms/${assignmentId}`)
}
```

- [ ] **Step 5: Write assignment fill page**

Create `app/(student)/my-forms/[assignmentId]/page.tsx`:
```tsx
import { getAssignmentDetail } from '@/actions/submissions'
import { FormRenderer } from '@/components/FormRenderer'
import { DocumentUploader } from '@/components/DocumentUploader'
import { notFound, redirect } from 'next/navigation'

export default async function FillFormPage({ params }: { params: { assignmentId: string } }) {
  let detail: Awaited<ReturnType<typeof getAssignmentDetail>>
  try { detail = await getAssignmentDetail(params.assignmentId) }
  catch { notFound() }

  const template = (detail.form_templates as any)
  const submission = (detail.submissions as any)?.[0] ?? null

  // Already approved — redirect to status
  if (submission?.status === 'approved') redirect(`/my-forms/${params.assignmentId}/status`)

  const savedAnswers: Record<string, string> = {}
  for (const ans of submission?.field_answers ?? []) {
    savedAnswers[ans.field_id] = ans.value
  }
  const uploadedMap: Record<string, { file_name: string }> = {}
  for (const up of submission?.document_uploads ?? []) {
    uploadedMap[up.slot_id] = { file_name: up.file_name }
  }

  const isResubmit = submission?.status === 'rejected'
  const fields = [...(template.form_fields ?? [])].sort((a: any, b: any) => a.order - b.order)
  const slots = [...(template.document_slots ?? [])].sort((a: any, b: any) => a.order - b.order)

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">{template.name}</h1>
      {template.description && <p className="text-slate-500 text-sm mb-1">{template.description}</p>}
      <p className="text-xs text-slate-400 mb-6">Due {template.deadline}</p>

      {isResubmit && submission?.review_note && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <strong>Rejected:</strong> {submission.review_note}
        </div>
      )}

      {template.type === 'data_entry' ? (
        <FormRenderer
          assignmentId={params.assignmentId}
          fields={fields}
          savedAnswers={savedAnswers}
          isResubmit={isResubmit}
        />
      ) : (
        <DocumentUploader
          assignmentId={params.assignmentId}
          submissionId={submission?.id ?? null}
          slots={slots}
          uploaded={uploadedMap}
          isResubmit={isResubmit}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 6: Write submission status page**

Create `app/(student)/my-forms/[assignmentId]/status/page.tsx`:
```tsx
import { getAssignmentDetail } from '@/actions/submissions'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function SubmissionStatusPage({ params }: { params: { assignmentId: string } }) {
  let detail: Awaited<ReturnType<typeof getAssignmentDetail>>
  try { detail = await getAssignmentDetail(params.assignmentId) }
  catch { notFound() }

  const template = (detail.form_templates as any)
  const submission = (detail.submissions as any)?.[0]
  if (!submission) notFound()

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">{template.name}</h1>
      <p className="text-xs text-slate-400 mb-6">Due {template.deadline}</p>
      <div className="flex items-center gap-3 mb-4">
        <StatusBadge status={submission.status} />
        {submission.reviewed_at && (
          <span className="text-xs text-slate-400">
            Reviewed {new Date(submission.reviewed_at).toLocaleDateString()}
          </span>
        )}
      </div>
      {submission.status === 'rejected' && submission.review_note && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <strong>Reason:</strong> {submission.review_note}
        </div>
      )}
      {submission.status === 'rejected' && (
        <Button asChild><Link href={`/my-forms/${params.assignmentId}`}>Resubmit</Link></Button>
      )}
      {submission.status !== 'rejected' && (
        <Button asChild variant="outline"><Link href="/my-forms">← Back to my forms</Link></Button>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Manual test**

As student: click a data-entry form → fill in fields → Save draft → refresh → values persisted → Submit → redirected to /my-forms → form shows "Submitted". Repeat for document upload form.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add form fill, document upload, and submission status pages"
```

---

## Task 10: Organizer Review Flow & Email

**Files:**
- Create: `app/(organizer)/exchanges/[id]/submissions/[submissionId]/page.tsx`
- Create: `lib/email.ts`
- Modify: `actions/submissions.ts`

**Interfaces:**
- Produces: `reviewSubmission(submissionId, action, note?)` server action
- Produces: `sendRejectionEmail(to, studentName, formName, note, resubmitUrl)` from `lib/email.ts`

- [ ] **Step 1: Write email helper**

Create `lib/email.ts`:
```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendRejectionEmail({
  to, studentName, formName, note, resubmitUrl,
}: {
  to: string; studentName: string; formName: string; note: string; resubmitUrl: string
}) {
  await resend.emails.send({
    from: 'EazyExchange <noreply@eazyexchange.com>',
    to,
    subject: `Action required: ${formName} was returned`,
    html: `
      <p>Hi ${studentName || 'there'},</p>
      <p>Your submission for <strong>${formName}</strong> was returned by your organizer.</p>
      <p><strong>Reason:</strong> ${note}</p>
      <p><a href="${resubmitUrl}">Click here to resubmit</a></p>
      <p>EazyExchange</p>
    `,
  })
}
```

- [ ] **Step 2: Add reviewSubmission action**

Append to `actions/submissions.ts`:
```typescript
export async function getSubmissionDetail(assignmentId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .select(`
      id, status, review_note, submitted_at,
      assignments!inner(
        student_id,
        users!inner(full_name, email),
        form_templates!inner(id, name, type,
          form_fields(id, label, field_type, order),
          document_slots(id, label, order)
        )
      ),
      field_answers(field_id, value),
      document_uploads(slot_id, file_name, storage_path)
    `)
    .eq('assignment_id', assignmentId)
    .single()
  if (error) throw error
  return data
}

export async function reviewSubmission(assignmentId: string, action: 'approved' | 'rejected', note?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: submission } = await supabase
    .from('submissions').select('id, assignment_id').eq('assignment_id', assignmentId).single()
  if (!submission) throw new Error('Submission not found')

  const { error } = await supabase.from('submissions').update({
    status: action,
    reviewed_at: new Date().toISOString(),
    reviewer_id: user.id,
    review_note: note ?? null,
  }).eq('id', submission.id)
  if (error) throw error

  if (action === 'rejected' && note) {
    const { data: detail } = await supabase
      .from('assignments')
      .select('student_id, users!inner(full_name, email), form_templates!inner(name)')
      .eq('id', assignmentId).single()

    if (detail) {
      const student = (detail.users as any)
      const template = (detail.form_templates as any)
      const { sendRejectionEmail } = await import('@/lib/email')
      await sendRejectionEmail({
        to: student.email,
        studentName: student.full_name,
        formName: template.name,
        note,
        resubmitUrl: `${process.env.NEXT_PUBLIC_APP_URL}/my-forms/${assignmentId}`,
      })
    }
  }

  revalidatePath(`/exchanges`)
}
```

- [ ] **Step 3: Write organizer review page**

Create `app/(organizer)/exchanges/[id]/submissions/[submissionId]/page.tsx`:
```tsx
'use client'
import { getSubmissionDetail, reviewSubmission } from '@/actions/submissions'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { notFound, useRouter } from 'next/navigation'
import { use, useEffect, useState } from 'react'

export default function ReviewPage({ params }: { params: { id: string; submissionId: string } }) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getSubmissionDetail>> | null>(null)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    getSubmissionDetail(params.submissionId).then(setDetail).catch(() => router.push('/dashboard'))
  }, [params.submissionId])

  if (!detail) return <div className="animate-pulse text-slate-400">Loading…</div>

  const assignment = (detail.assignments as any)
  const template = assignment.form_templates
  const student = assignment.users
  const answers: Record<string, string> = {}
  for (const a of detail.field_answers ?? []) answers[a.field_id] = a.value

  async function handleReview(action: 'approved' | 'rejected') {
    if (action === 'rejected' && !note.trim()) { setError('Please add a note explaining why.'); return }
    setLoading(action)
    setError(null)
    try {
      await reviewSubmission(params.submissionId, action, note || undefined)
      router.push(`/exchanges/${params.id}`)
    } catch (e: any) { setError(e.message); setLoading(null) }
  }

  const fields = [...(template.form_fields ?? [])].sort((a: any, b: any) => a.order - b.order)
  const slots = [...(template.document_slots ?? [])].sort((a: any, b: any) => a.order - b.order)

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">{template.name}</h1>
        <p className="text-sm text-slate-500">
          {student.full_name || student.email} · submitted {new Date(detail.submitted_at ?? '').toLocaleDateString()}
        </p>
        <div className="mt-2"><StatusBadge status={detail.status} /></div>
      </div>

      {template.type === 'data_entry' && (
        <div className="space-y-4 mb-8">
          {fields.map((f: any) => (
            <div key={f.id}>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{f.label}</p>
              <p className="text-sm mt-0.5">{answers[f.id] ?? '—'}</p>
            </div>
          ))}
        </div>
      )}

      {template.type === 'document_upload' && (
        <div className="space-y-4 mb-8">
          {slots.map((s: any) => {
            const upload = detail.document_uploads?.find((u: any) => u.slot_id === s.id)
            return (
              <div key={s.id}>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{s.label}</p>
                {upload ? (
                  <DownloadLink path={upload.storage_path} name={upload.file_name} />
                ) : <p className="text-sm text-slate-400">Not uploaded</p>}
              </div>
            )
          })}
        </div>
      )}

      {detail.status === 'submitted' && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Rejection note (required if rejecting)</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="Explain what needs to be corrected…" rows={3} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <Button onClick={() => handleReview('approved')} disabled={!!loading}>
              {loading === 'approve' ? 'Approving…' : 'Approve'}
            </Button>
            <Button variant="destructive" onClick={() => handleReview('rejected')} disabled={!!loading}>
              {loading === 'reject' ? 'Rejecting…' : 'Reject'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function DownloadLink({ path, name }: { path: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const supabase = createClient()
    supabase.storage.from('documents').createSignedUrl(path, 60).then(({ data }) => {
      if (data) setUrl(data.signedUrl)
    })
  }, [path])
  if (!url) return <span className="text-sm text-slate-400">Loading…</span>
  return <a href={url} target="_blank" rel="noopener noreferrer"
    className="text-sm text-blue-600 hover:underline">{name}</a>
}
```

- [ ] **Step 4: Manual test**

As organizer: click a "Submitted" badge in master grid → review page shows student's answers → click Approve → grid updates to Approved. Repeat, click Reject with a note → student receives rejection email → student can resubmit.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add organizer review flow with approve/reject and rejection email"
```

---

## Task 11: Automated Reminder Edge Function

**Files:**
- Create: `supabase/functions/send-reminders/index.ts`

**Interfaces:**
- Consumes: Supabase service role key (env var `SUPABASE_SERVICE_ROLE_KEY`), Resend API key (`RESEND_API_KEY`)
- Produces: sends reminder emails to students with forms due in 7 or 3 days

- [ ] **Step 1: Write edge function**

Create `supabase/functions/send-reminders/index.ts`:
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? 'https://eazyexchange.com'

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const today = new Date()
  const in7 = new Date(today); in7.setDate(today.getDate() + 7)
  const in3 = new Date(today); in3.setDate(today.getDate() + 3)

  const fmt = (d: Date) => d.toISOString().split('T')[0]

  // Find assignments that are not approved and deadline is in 7 or 3 days
  const { data: assignments, error } = await supabase
    .from('assignments')
    .select(`
      id, student_id,
      users!inner(full_name, email),
      form_templates!inner(name, deadline),
      submissions(status)
    `)
    .in('form_templates.deadline', [fmt(in7), fmt(in3)])

  if (error) {
    console.error('Query error:', error)
    return new Response('Error', { status: 500 })
  }

  // Group by student, skip approved
  const byStudent: Record<string, { email: string; name: string; forms: { name: string; deadline: string; assignmentId: string }[] }> = {}

  for (const a of assignments ?? []) {
    const submission = (a.submissions as any)?.[0]
    if (submission?.status === 'approved') continue

    const student = a.users as any
    const template = a.form_templates as any

    if (!byStudent[a.student_id]) {
      byStudent[a.student_id] = { email: student.email, name: student.full_name, forms: [] }
    }
    byStudent[a.student_id].forms.push({
      name: template.name,
      deadline: template.deadline,
      assignmentId: a.id,
    })
  }

  for (const [, { email, name, forms }] of Object.entries(byStudent)) {
    const formList = forms.map(f =>
      `<li><a href="${APP_URL}/my-forms/${f.assignmentId}">${f.name}</a> — due ${f.deadline}</li>`
    ).join('')

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'EazyExchange <noreply@eazyexchange.com>',
        to: email,
        subject: `Reminder: you have ${forms.length} form${forms.length > 1 ? 's' : ''} due soon`,
        html: `<p>Hi ${name || 'there'},</p>
          <p>You have ${forms.length} form${forms.length > 1 ? 's' : ''} due soon on EazyExchange:</p>
          <ul>${formList}</ul>
          <p>Please log in and complete them before the deadline.</p>
          <p>EazyExchange</p>`,
      }),
    })
  }

  return new Response(`Sent reminders to ${Object.keys(byStudent).length} students`)
})
```

- [ ] **Step 2: Deploy edge function**

```bash
pnpm supabase functions deploy send-reminders
```

Set secrets:
```bash
pnpm supabase secrets set RESEND_API_KEY=your_key
pnpm supabase secrets set NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

- [ ] **Step 3: Schedule cron**

In Supabase dashboard → Edge Functions → send-reminders → Schedule:
- Cron expression: `0 8 * * *` (daily at 08:00 UTC)

Or via SQL in the Supabase SQL editor:
```sql
select cron.schedule(
  'send-reminders-daily',
  '0 8 * * *',
  $$select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/send-reminders',
    headers := '{"Authorization": "Bearer <anon-key>"}'::jsonb
  )$$
);
```

- [ ] **Step 4: Manual test**

Create an assignment with a deadline 7 days from today. Invoke the function manually:
```bash
pnpm supabase functions invoke send-reminders
```

Expected: function returns a count, student receives reminder email.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add automated reminder edge function with daily cron"
```

---

## Task 12: Deploy to Vercel

**Files:** No new files — deployment configuration

- [ ] **Step 1: Push to GitHub**

```bash
git remote add origin https://github.com/<your-username>/eazyexchange.git
git push -u origin main
```

- [ ] **Step 2: Deploy on Vercel**

1. Go to vercel.com → New Project → Import from GitHub → select `eazyexchange`
2. Framework preset: Next.js
3. Add all environment variables from `.env.local`
4. Deploy

- [ ] **Step 3: Update Supabase redirect URL**

In Supabase dashboard → Authentication → URL Configuration:
- Site URL: `https://your-app.vercel.app`
- Redirect URLs: add `https://your-app.vercel.app/accept-invite`

- [ ] **Step 4: Update edge function secrets**

```bash
pnpm supabase secrets set NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

- [ ] **Step 5: End-to-end smoke test**

1. Sign in as organizer → create exchange → create form template with 2 fields → invite a student email
2. Accept invite as student → set name + password → land on /my-forms → form appears
3. Fill out form → submit → organizer master grid shows "Submitted"
4. Organizer clicks submitted → review page → approve → grid shows "Approved"
5. Invite second student → reject their submission with a note → confirm rejection email arrives
6. Student resubmits → organizer approves

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: deploy to Vercel and update Supabase redirect URLs"
```

---

## Self-Review Notes

**Spec coverage:**
- ✅ Student checklist with deadlines and status
- ✅ Organizer master grid (students × forms)
- ✅ Data entry forms with field types
- ✅ Document upload with named slots
- ✅ Organizer review + approve/reject with note
- ✅ Email invite flow (organizer → student)
- ✅ Automated reminders at 7 and 3 days
- ✅ Rejection email to student
- ✅ RLS: per-school data isolation
- ✅ Student resubmission after rejection

**Not in MVP (by design):**
- Joint organizer collaboration between both schools
- Form template editing after students have submissions (safe to add later)
- Organizer seeing partner school's students
