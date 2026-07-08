// Seeds the staging Supabase project with fake preview-testing data:
// one school, one organizer login, one exchange, two enrolled students.
// Idempotent: re-running reuses existing auth users and skips existing rows.
//
// Refuses to run against anything but the staging project ref — this script
// must never touch production.
//
// Run:
//   set -a; source .env.staging; set +a
//   SEED_PASSWORD='<login password for all seeded users>' node scripts/seed-staging.mjs
import { createClient } from '@supabase/supabase-js'

const ref = process.env.STAGING_PROJECT_REF
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.SEED_PASSWORD

const missing = ['STAGING_PROJECT_REF', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SEED_PASSWORD']
  .filter((k) => !process.env[k])
if (missing.length) {
  console.error(`Missing env var(s): ${missing.join(', ')} — see the header of this file.`)
  process.exit(1)
}
if (!url.includes(ref)) {
  console.error(`Refusing to seed: ${url} is not the staging project (${ref}).`)
  process.exit(1)
}

const admin = createClient(url, serviceKey)

async function ensureAuthUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (!error) return data.user.id
  const { data: list, error: listError } = await admin.auth.admin.listUsers()
  if (listError) throw listError
  const existing = list.users.find((u) => u.email === email)
  if (!existing) throw new Error(`createUser failed for ${email}: ${error.message}`)
  return existing.id
}

async function ensureProfile(id, schoolId, role, fullName, email, orgRole) {
  const { data: existing } = await admin.from('users').select('id').eq('id', id).maybeSingle()
  if (existing) return
  const row = { id, school_id: schoolId, role, full_name: fullName, email }
  if (orgRole) row.org_role = orgRole
  const { error } = await admin.from('users').insert(row)
  if (error) throw error
}

const SCHOOL_NAME = 'Lycée Démo (staging)'
const EXCHANGE_NAME = 'Échange Démo 2026'

// School
let { data: school } = await admin.from('schools').select('id').eq('name', SCHOOL_NAME).maybeSingle()
if (!school) {
  const { data, error } = await admin.from('schools').insert({ name: SCHOOL_NAME }).select('id').single()
  if (error) throw error
  school = data
}

// Organizer
const organizerId = await ensureAuthUser('demo-organizer@example.com')
await ensureProfile(organizerId, school.id, 'organizer', 'Orga Démo', 'demo-organizer@example.com', 'owner')

// Exchange
let { data: exchange } = await admin.from('exchanges')
  .select('id').eq('school_a_id', school.id).eq('name', EXCHANGE_NAME).maybeSingle()
if (!exchange) {
  const { data, error } = await admin.from('exchanges')
    .insert({ name: EXCHANGE_NAME, year: 2026, school_a_id: school.id, school_b_id: null })
    .select('id').single()
  if (error) throw error
  exchange = data
}

// Students (fake minors — fake data only, never real addresses)
for (const [i, email] of ['demo-eleve-1@example.com', 'demo-eleve-2@example.com'].entries()) {
  const studentId = await ensureAuthUser(email)
  await ensureProfile(studentId, school.id, 'student', `Élève Démo ${i + 1}`, email)
  const { data: enrolled } = await admin.from('exchange_enrollments')
    .select('id').eq('exchange_id', exchange.id).eq('user_id', studentId).maybeSingle()
  if (!enrolled) {
    const { error } = await admin.from('exchange_enrollments')
      .insert({ exchange_id: exchange.id, user_id: studentId })
    if (error) throw error
  }
}

console.log(`Seeded: ${SCHOOL_NAME} / ${EXCHANGE_NAME} / 1 organizer + 2 students (password: SEED_PASSWORD)`)
