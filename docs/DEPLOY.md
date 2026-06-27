# Deployment Guide

Production setup for EazyExchange: Supabase (database, auth, storage, edge functions) + Vercel (Next.js) + Resend (email).

Do the steps in order — Vercel needs values produced by the Supabase and Resend steps.

---

## 0. Prerequisites

Accounts: [Supabase](https://supabase.com), [Vercel](https://vercel.com), [Resend](https://resend.com).

CLIs:

```bash
# Supabase CLI (via npm, or `brew install supabase/tap/supabase`)
pnpm add -g supabase
# Vercel CLI
pnpm add -g vercel

supabase --version
vercel --version
```

---

## 1. Supabase production project

1. Create a project in the Supabase dashboard. Note the **project ref** (the `xxxx` in `xxxx.supabase.co`) and the database password.
2. From **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY` (server-only — never expose to the browser)
3. Link the local repo and push the schema (applies all migrations in `supabase/migrations/`, including RLS and storage policies):

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase db push
```

4. Create the storage bucket the upload flow expects (private). The RLS policies for it are already applied by `db push` via `20260625000001_storage_policies.sql`, which also creates the bucket row — verify it exists under **Storage**; if not:

```bash
supabase storage create documents --no-public   # or create it in the dashboard, Public = No
```

---

## 2. Resend (email)

1. In Resend, add and verify your sending **domain** (or use the test sender `onboarding@resend.dev` for trials — note it can only send to your own verified address).
2. Create an API key → this is `RESEND_API_KEY`.
3. Decide your `EMAIL_FROM`, e.g. `EazyExchange <noreply@yourdomain.com>`.

---

## 3. Edge function + reminder cron

Deploy the reminders function and give it its secrets:

```bash
supabase functions deploy send-reminders

supabase secrets set \
  RESEND_API_KEY=<resend_key> \
  EMAIL_FROM='EazyExchange <noreply@yourdomain.com>' \
  APP_URL=https://<your-vercel-domain>
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into functions automatically — don't set them.)

Schedule it for daily 08:00:

1. Dashboard → **Database → Extensions**: enable `pg_cron` and `pg_net`.
2. Open `supabase/cron-setup.sql`, replace `<PROJECT_REF>` and `<SERVICE_ROLE_KEY>`, and run it in the **SQL Editor**.

Test it once manually:

```bash
curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
# → {"students":N,"emailsSent":N}
```

---

## 4. Vercel (frontend)

1. Import the Git repo in Vercel (framework auto-detected as Next.js).
2. **Settings → Environment Variables** (Production), add:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | from step 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from step 1 — the **Publishable key** (`sb_publishable_…`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | from step 1 — the **Secret key** (`sb_secret_…`) |
   | `RESEND_API_KEY` | from step 2 |
   | `EMAIL_FROM` | from step 2 |
   | `NEXT_PUBLIC_APP_URL` | your Vercel domain, e.g. `https://eazyexchange.vercel.app` |

   > **⚠️ The last 3 can't be filled in on the first deploy — set them afterward:**
   > - `RESEND_API_KEY` and `EMAIL_FROM` depend on the Resend setup (step 2). Until they're set, email **degrades gracefully** — the app and submissions work fine; rejection/reminder emails are just skipped (logged as a warning).
   > - `NEXT_PUBLIC_APP_URL` isn't known until the first deploy assigns a domain. Deploy once, copy the production URL, set this var, then **redeploy** so the value is baked in (it's a `NEXT_PUBLIC_` build-time var).
   >
   > Only the first three (Supabase URL + the two keys) are required for the initial build to succeed. Add the others and redeploy once you've done step 2 / have your domain.

3. Deploy:

```bash
vercel        # preview
vercel --prod # production
```

---

## 5. Supabase Auth redirect config

The invite flow redirects to `/accept-invite` on your domain. In **Authentication → URL Configuration**:

- **Site URL**: `https://<your-vercel-domain>`
- **Redirect URLs**: add `https://<your-vercel-domain>/accept-invite` (and `http://localhost:3000/accept-invite` for local dev).

The first organizer account has no UI to self-register (invite-only app). Create it manually:

1. **Authentication → Users → Add user** (set email + password, auto-confirm).
2. In the **SQL Editor**, insert their profile and school:

```sql
insert into schools (name) values ('Your School') returning id;
-- use the returned id below
insert into users (id, school_id, role, full_name, email)
values ('<auth_user_id>', '<school_id>', 'organizer', 'Your Name', 'you@yourschool.edu');
```

---

## 6. End-to-end smoke test

Run against the deployed app:

1. Sign in as the organizer → create an exchange.
2. Build one `data_entry` form and one `document_upload` form (set near-future deadlines).
3. Invite a student (use an email you can receive) → confirm the invite email arrives.
4. Open the invite link → set name + password → land on `/my-forms` with both forms assigned.
5. Fill the data-entry form (save draft, then submit); upload a file to the document form and submit.
6. As organizer, open the grid → both show **Submitted** → review one and **Reject** with a note.
7. Confirm the rejection email arrives; the student's checklist shows **Rejected** with the note.
8. Student resubmits → organizer **Approves** → grid shows **Approved**.
9. (Optional) trigger `send-reminders` manually (step 3) and confirm a summary email for forms due in 7/3 days.

---

## Notes

- Migrations are idempotent on a fresh project; re-running `db push` only applies new ones.
- Rotate the `service_role` key if it's ever exposed — it bypasses RLS.
- The reminder schedule runs at **08:00 UTC**; adjust the cron expression in `cron-setup.sql` for a local timezone. The cron fires daily, but the function paces each student's reminders (weekly while >7 days out, daily in the final week and while overdue) via `assignments.last_reminded_at`.
