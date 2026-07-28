// Builds one rich, fake exchange you can click through immediately: a school,
// two organizers, an open application funnel with applicants in every status,
// and a dozen enrolled students whose forms sit at every stage (untouched,
// draft, submitted, approved, rejected, overdue).
//
// The point is to never hand-drive the funnel again. One command, one world,
// always the same one — so a feature can be tested many times against
// identical state.
//
// Every run WIPES the seeded world and rebuilds it, so results are
// deterministic. Only seeded rows are touched: the seed school and the auth
// users under @seed.example.com. Nothing else is deleted.
//
// Refuses to run against anything but a local stack or the staging project.
// Production is unreachable by construction.
//
// Run (local stack):
//   supabase start
//   node scripts/seed-demo.mjs          # or: pnpm seed
//
// Run (staging):
//   set -a; source .env.staging; set +a
//   node scripts/seed-demo.mjs          # or: pnpm seed:staging
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { STUDENTS, SMOKE_STUDENTS, APPLICANTS, TEMPLATES, SHAPES, SHAPE_LABELS, HIGHLIGHTS } from './seed-cast.mjs'
import { buildManifest } from './lib/manifest.mjs'
import { applyStudentShape, dayFactory } from './lib/student-shape.mjs'

const SEED_DOMAIN = 'seed.example.com'
const SCHOOL_NAME = 'Lycée Démo (seed)'
const EXCHANGE_NAME = 'Échange Démo 2026'
const PASSWORD = process.env.SEED_PASSWORD ?? 'demo1234'

// --- target resolution + prod guard -----------------------------------------

// Local stack defaults: `supabase start` prints these and they are the same on
// every machine, so the zero-config path needs no env file at all.
const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const stagingRef = process.env.STAGING_PROJECT_REF

const isLocal = (u) => /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(u)

let url, serviceKey, anonKey
if (!envUrl || isLocal(envUrl)) {
  url = envUrl ?? LOCAL_URL
  serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL_SERVICE_KEY
  anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? LOCAL_ANON_KEY
} else {
  url = envUrl
  serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
}

// The whole safety model: a remote URL is only ever accepted when it is the
// staging project named by .env.staging. No prod ref is hardcoded — anything
// that is not local and not staging is refused, including refs that do not
// exist yet.
if (!isLocal(url) && !(stagingRef && url.includes(stagingRef))) {
  console.error(
    `Refusing to seed ${url}.\n` +
      'This script only targets a local Supabase stack or the staging project.\n' +
      'For staging: set -a; source .env.staging; set +a',
  )
  process.exit(1)
}
if (!serviceKey || !anonKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  process.exit(1)
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } })
const where = isLocal(url) ? 'LOCAL' : `STAGING (${stagingRef})`

// --- helpers ----------------------------------------------------------------

const day = dayFactory()
const dayOnly = (offset) => day(offset).slice(0, 10)
const email = (slug) => `${slug}@${SEED_DOMAIN}`

async function insert(table, rows, select = 'id') {
  const { data, error } = await db.from(table).insert(rows).select(select)
  if (error) throw new Error(`${table}: ${error.message}`)
  return data
}

async function insertOne(table, row, select = 'id') {
  return (await insert(table, [row], select))[0]
}

// Auth users are not FK-cascaded from schools, so they are removed by email.
async function listSeedAuthUsers() {
  const found = []
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    found.push(...data.users.filter((u) => u.email?.endsWith(`@${SEED_DOMAIN}`)))
    if (data.users.length < 1000) return found
  }
}

async function createAuthUser(slug, fullName) {
  const { data, error } = await db.auth.admin.createUser({
    email: email(slug),
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error) throw new Error(`auth ${slug}: ${error.message}`)
  return data.user.id
}

// Teardown order matters. Several columns point back at a users row with ON
// DELETE NO ACTION (form_templates.created_by, submissions.reviewer_id,
// applications.reviewer_id), and users.school_id blocks the school delete. So:
// school-owned data first, then the auth users, then the school itself.
async function wipe() {
  const { data: schools } = await db.from('schools').select('id').eq('name', SCHOOL_NAME)

  for (const s of schools ?? []) {
    for (const table of ['applications', 'form_templates', 'exchanges']) {
      const column = table === 'exchanges' ? 'school_a_id' : 'school_id'
      const { error } = await db.from(table).delete().eq(column, s.id)
      if (error) throw new Error(`wipe ${table}: ${error.message}`)
    }
  }

  for (const u of await listSeedAuthUsers()) {
    const { error } = await db.auth.admin.deleteUser(u.id)
    if (error) throw new Error(`wipe auth ${u.email}: ${JSON.stringify(error)}`)
  }

  for (const s of schools ?? []) {
    const { error } = await db.from('schools').delete().eq('id', s.id)
    if (error) throw new Error(`wipe school: ${error.message}`)
  }
}

// The cast (STUDENTS / APPLICANTS / TEMPLATES / SHAPES) lives in
// ./seed-cast.mjs — this file executes on import, so keeping the data in a
// side-effect-free module is what lets tests assert on it.

// A complete, valid application. Realistic enough that review screens, the
// good-news email and the generated PDFs all have something to render.
function applicationData(name, slug) {
  const [first, last] = name.split(' ')
  return {
    last_name: last, first_name: first,
    native_language: 'Français', nationality: 'Française',
    date_of_birth: '2009-04-12', sex: 'F', pronouns: 'elle/she',
    grade: 'Première', french_class: '1ère B',
    email: email(slug), cell_phone: '+33 6 12 34 56 78',
    mother_last_name: last, mother_first_name: 'Sylvie',
    mother_nationality: 'Française', mother_native_language: 'Français',
    mother_cell_phone: '+33 6 98 76 54 32',
    mother_email: email(`${slug}-mere`),
    mother_address: '12 rue des Lilas, 75011 Paris',
    mother_occupation: 'Architecte',
    family_status: 'married',
    brothers_at_home: '1 (14 ans)', sisters_at_home: '0',
    pets: 'Un chat', food_requirements: 'Végétarienne',
    other_allergies: 'Pollen', main_language_home: 'Français',
    other_languages_home: 'Anglais', smoking_home: 'no',
    own_room: 'yes', accept_opposite_sex: 'yes',
    lived_abroad: "Deux ans à Berlin quand j'avais huit ans.",
    countries_with_parents: 'Espagne, Italie, Allemagne, Portugal.',
    countries_without_parents: "Une semaine en Irlande en séjour linguistique.",
    sports: 'Natation, six heures par semaine.',
    activities: "Club de théâtre, deux heures par semaine.",
    instruments: 'Piano depuis huit ans.',
    family_activities: 'Randonnée et cinéma le week-end.',
    spare_time: 'Lire et dessiner.',
    adjectives: 'Curieuse, patiente, drôle.',
    recharge: "Plutôt entourée : j'aime discuter pour décompresser.",
    todo_list: 'Voir une aurore boréale, apprendre le japonais, plonger.',
    ideal_partner: "Quelqu'un de curieux et facile à vivre.",
    share_when_hosting: 'La cuisine familiale et mon quartier.',
    anything_else: 'Très motivée pour cet échange.',
  }
}

// A partially filled draft — enough to show a name in the list, not enough to
// pass submit validation.
function partialData(name, slug) {
  const full = applicationData(name, slug)
  return {
    first_name: full.first_name, last_name: full.last_name,
    email: full.email, date_of_birth: full.date_of_birth,
    nationality: full.nationality, native_language: full.native_language,
  }
}

// --- build ------------------------------------------------------------------

console.log(`Seeding ${where} — ${url}`)

// A stopped local stack otherwise surfaces as an opaque `fetch failed` from
// somewhere deep inside the auth client.
const { error: reachError } = await db.from('schools').select('id').limit(1)
if (reachError) {
  console.error(
    `Cannot reach ${url}: ${reachError.message}\n` +
      (isLocal(url)
        ? 'Is the local stack running? Start it with `supabase start`.'
        : 'Check the credentials in .env.staging.'),
  )
  process.exit(1)
}

await wipe()

const school = await insertOne('schools', {
  name: SCHOOL_NAME,
  subscription_status: 'trialing',
  plan: null,
})

const organizerId = await createAuthUser('orga', 'Claire Organisatrice')
const collaboratorId = await createAuthUser('orga-2', 'Marc Collaborateur')
// `status: 'approved'` is explicit and load-bearing, exactly as it is in
// tests/rls/seed.ts. set_initial_user_status() only auto-approves a student, an
// allowlisted address, or someone joining a school that ALREADY has an approved
// organizer — a seeded owner matches none of those, because their school is
// brand new. Left to the 'pending' default they are invisible to my_role(),
// which silently denies every organizer RLS policy: /dev sign-in lands on
// /pending, and the seed's own approvals match zero rows without erroring.
await insert('users', [
  {
    id: organizerId, school_id: school.id, role: 'organizer', org_role: 'owner',
    full_name: 'Claire Organisatrice', email: email('orga'), locale: 'fr',
    status: 'approved',
  },
  {
    id: collaboratorId, school_id: school.id, role: 'organizer', org_role: 'admin',
    full_name: 'Marc Collaborateur', email: email('orga-2'), locale: 'fr',
    status: 'approved',
  },
])

const exchange = await insertOne('exchanges', {
  name: EXCHANGE_NAME,
  year: 2026,
  school_a_id: school.id,
  school_b_id: null,
  phase: 2,
  apply_slug: 'demo-2026',
  application_open: true,
  application_deadline: dayOnly(20),
  reminders_enabled: true,
  reminder_cadence: 'normale',
})

await insert('exchange_program_details', [{
  exchange_id: exchange.id,
  sending_school_name: SCHOOL_NAME,
  sending_city: 'Paris',
  receiving_school_name: 'Roosevelt High School',
  destination: 'Portland, Oregon',
  proviseur_name: 'Mme Durand',
  association_name: 'Association Démo',
  chaperones: ['Claire Organisatrice', 'Marc Collaborateur'],
  travel_start: dayOnly(60),
  travel_end: dayOnly(81),
  absence_dates: [dayOnly(60), dayOnly(81)],
}], 'exchange_id')

await insert('exchange_info_cards', [
  { exchange_id: exchange.id, position: 0, title: 'Dates du voyage',
    body: `Départ le ${dayOnly(60)}, retour le ${dayOnly(81)}. Rendez-vous à l'aéroport trois heures avant.` },
  { exchange_id: exchange.id, position: 1, title: 'Coût du séjour',
    body: 'Environ 1 200 € par élève, vol et assurance compris. Un échelonnement en trois fois est possible.' },
  { exchange_id: exchange.id, position: 2, title: 'Réunion parents',
    body: `Réunion d'information le ${dayOnly(10)} à 18h au CDI.` },
])

// Signed in here rather than after the loop: applyStudentShape performs each
// student's approvals inline, the way the app does them — as the organizer,
// through RLS and the review guard.
const asOrganizer = createClient(url, anonKey, { auth: { persistSession: false } })
const { error: signInError } = await asOrganizer.auth.signInWithPassword({
  email: email('orga'),
  password: PASSWORD,
})
if (signInError) throw new Error(`organizer sign-in: ${signInError.message}`)

// Templates. The insert trigger assigns them to enrolled students, so these
// must exist before the enrollments below.
const templates = []
for (const t of TEMPLATES) {
  const row = await insertOne('form_templates', {
    exchange_id: exchange.id,
    school_id: school.id,
    name: t.name,
    description: `Formulaire de démonstration — ${t.name}.`,
    type: t.kind === 'fillable' || t.kind === 'online' ? 'data_entry' : 'document_upload',
    kind: t.kind,
    status: 'active',
    audience: 'all',
    standard_key: t.key,
    deadline: dayOnly(t.deadline),
    created_by: organizerId,
  })
  if (t.kind !== 'fillable' && t.kind !== 'online') {
    await insert('document_slots', [
      { template_id: row.id, label: t.name, description: null, required: true, order: 0 },
    ])
  }
  templates.push(row)
}

// Enrolled students. Enrollment fans out one assignment per template; the
// submissions below are then written onto those assignments.
for (const s of [...STUDENTS, ...SMOKE_STUDENTS]) {
  const userId = await createAuthUser(s.slug, s.name)
  await insert('users', [{
    id: userId, school_id: school.id, role: 'student',
    full_name: s.name, email: email(s.slug), locale: 'fr',
  }])

  // An enrolled student also keeps their accepted application on file.
  await insert('applications', [{
    exchange_id: exchange.id, school_id: school.id, email: email(s.slug),
    status: 'enrolled', data: applicationData(s.name, s.slug), language: 'fr',
    resume_token: crypto.randomUUID(), enrolled_user_id: userId,
    submitted_at: day(-30), reviewed_at: day(-25), reviewer_id: organizerId,
    invite_response: 'yes', responded_at: day(-24),
    terms_acknowledged_at: day(-24),
  }])

  await insert('exchange_enrollments', [{ exchange_id: exchange.id, user_id: userId }])

  await applyStudentShape({
    db,
    asOrganizer,
    organizerId,
    studentId: userId,
    shape: SHAPES[s.shape],
    templateIds: templates.map((t) => t.id),
    day,
  })
}

// Applicants still in the funnel.
for (const a of APPLICANTS) {
  const complete = a.status !== 'draft' && a.status !== 'invited'
  await insert('applications', [{
    exchange_id: exchange.id,
    school_id: school.id,
    email: email(a.slug),
    status: a.status,
    data: complete ? applicationData(a.name, a.slug) : a.status === 'draft' ? partialData(a.name, a.slug) : {},
    language: 'fr',
    resume_token: crypto.randomUUID(),
    resume_token_expires_at: day(21),
    invited_at: a.status === 'invited' ? day(-3) : null,
    invite_token: a.status === 'invited' ? crypto.randomUUID() : null,
    invite_token_expires_at: a.status === 'invited' ? day(11) : null,
    submitted_at: complete ? day(-9) : null,
    terms_acknowledged_at: complete ? day(-9) : null,
    reviewed_at: ['rejected', 'accepted', 'declined'].includes(a.status) ? day(-4) : null,
    reviewer_id: ['rejected', 'accepted', 'declined'].includes(a.status) ? organizerId : null,
    review_note: a.status === 'rejected' ? 'Dossier incomplet pour cette session.' : null,
    invite_response: a.status === 'declined' ? 'no' : null,
    responded_at: a.status === 'declined' ? day(-2) : null,
  }])
}

// --- report -----------------------------------------------------------------

const { count: applicationCount } = await db
  .from('applications').select('id', { count: 'exact', head: true }).eq('exchange_id', exchange.id)

// The /dev page reads this instead of querying the database.
writeFileSync(
  '.seed-manifest.json',
  JSON.stringify(
    buildManifest({
      password: PASSWORD,
      domain: SEED_DOMAIN,
      school: SCHOOL_NAME,
      exchange: EXCHANGE_NAME,
      students: STUDENTS,
      smokeStudents: SMOKE_STUDENTS,
      highlights: HIGHLIGHTS,
      labels: SHAPE_LABELS,
    }),
    null,
    2,
  ) + '\n',
)

const roster = STUDENTS.map((s) => `  ${s.slug}  ${s.name} — ${SHAPE_LABELS[s.shape]}`).join('\n')

console.log(`
Seeded ${where}.

  School      ${SCHOOL_NAME}
  Exchange    ${EXCHANGE_NAME}  (phase 2, applications open)
  Apply page  /apply/demo-2026
  Forms       ${templates.length}  (one overdue, one due in 3 days)
  Students    ${STUDENTS.length} enrolled, every completion state covered
  Reserved    ${SMOKE_STUDENTS.map((s) => s.slug).join(', ')} — automated smoke only, do not click
  Applicants  ${applicationCount} rows — invited / draft / submitted / rejected / accepted / declined / enrolled

Logins (password: ${PASSWORD})
  organizer     ${email('orga')}       owner
  collaborator  ${email('orga-2')}     admin

${roster}
${isLocal(url) ? '\n  All email lands in Inbucket: http://127.0.0.1:54324\n' : ''}`)
