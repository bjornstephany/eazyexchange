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
import { createClient } from '@supabase/supabase-js'

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

const DAY = 86_400_000
const day = (offset) => new Date(Date.now() + offset * DAY).toISOString()
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

// --- the cast ---------------------------------------------------------------

// Enrolled students, each pinned to one form-completion shape so every state
// the organizer dashboard can render is on screen at once.
const STUDENTS = [
  { slug: 'eleve-01', name: 'Camille Bernard', shape: 'untouched' },
  { slug: 'eleve-02', name: 'Louis Moreau', shape: 'untouched' },
  { slug: 'eleve-03', name: 'Emma Petit', shape: 'all-approved' },
  { slug: 'eleve-04', name: 'Hugo Lefebvre', shape: 'all-submitted' },
  { slug: 'eleve-05', name: 'Léa Roux', shape: 'mixed' },
  { slug: 'eleve-06', name: 'Gabriel Fournier', shape: 'mixed' },
  { slug: 'eleve-07', name: 'Chloé Girard', shape: 'one-rejected' },
  { slug: 'eleve-08', name: 'Raphaël Bonnet', shape: 'half-done' },
  { slug: 'eleve-09', name: 'Alice Dupont', shape: 'half-done' },
  { slug: 'eleve-10', name: 'Noah Lambert', shape: 'overdue' },
  { slug: 'eleve-11', name: 'Jade Mercier', shape: 'overdue' },
  { slug: 'eleve-12', name: 'Arthur Vincent', shape: 'all-approved' },
]

// Applicants who have NOT been enrolled — the funnel side of the app.
const APPLICANTS = [
  { slug: 'cand-invite', name: 'Sacha Blanc', status: 'invited' },
  { slug: 'cand-draft-1', name: 'Manon Faure', status: 'draft' },
  { slug: 'cand-draft-2', name: 'Théo Garnier', status: 'draft' },
  { slug: 'cand-soumis-1', name: 'Inès Chevalier', status: 'submitted' },
  { slug: 'cand-soumis-2', name: 'Nathan Robin', status: 'submitted' },
  { slug: 'cand-soumis-3', name: 'Lina Marchand', status: 'submitted' },
  { slug: 'cand-refuse', name: 'Enzo Perrin', status: 'rejected' },
  { slug: 'cand-accepte', name: 'Zoé Dumont', status: 'accepted' },
  { slug: 'cand-decline', name: 'Adam Leroy', status: 'declined' },
]

// Forms the exchange asks for. Deadlines are spread on purpose: one already
// past (so "overdue" is reachable), one in three days (so the final-week
// reminder pacing is reachable), the rest comfortably ahead.
const TEMPLATES = [
  { key: 'medical', name: 'Autorisation médicale', kind: 'fillable', deadline: 14 },
  { key: 'decharge', name: 'Décharge de responsabilité', kind: 'fillable', deadline: 14 },
  { key: 'absence', name: "Demande d'absence", kind: 'fillable', deadline: 3 },
  { key: 'famille', name: "Engagement de famille d'accueil", kind: 'fillable', deadline: 21 },
  { key: 'passeport', name: 'Copie du passeport', kind: 'pdf', deadline: -4 },
  { key: 'esta', name: 'Autorisation ESTA', kind: 'pdf', deadline: 30 },
]

// Which submission status each shape gives the Nth form. `null` = the student
// never opened it, so no submission row exists at all.
const SHAPES = {
  untouched: [null, null, null, null, null, null],
  'all-approved': ['approved', 'approved', 'approved', 'approved', 'approved', 'approved'],
  'all-submitted': ['submitted', 'submitted', 'submitted', 'submitted', 'submitted', 'submitted'],
  mixed: ['approved', 'submitted', 'draft', null, 'approved', null],
  'one-rejected': ['approved', 'rejected', 'submitted', 'approved', null, null],
  'half-done': ['approved', 'approved', 'draft', null, null, null],
  overdue: [null, null, null, null, null, 'draft'],
}

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
await insert('users', [
  {
    id: organizerId, school_id: school.id, role: 'organizer', org_role: 'owner',
    full_name: 'Claire Organisatrice', email: email('orga'), locale: 'fr',
  },
  {
    id: collaboratorId, school_id: school.id, role: 'organizer', org_role: 'admin',
    full_name: 'Marc Collaborateur', email: email('orga-2'), locale: 'fr',
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

// Review outcomes are collected while building students, then applied at the
// end through an authenticated organizer client.
const pendingReviews = []

// Enrolled students. Enrollment fans out one assignment per template; the
// submissions below are then written onto those assignments.
for (const s of STUDENTS) {
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

  const { data: assignments, error } = await db
    .from('assignments')
    .select('id, template_id')
    .eq('student_id', userId)
  if (error) throw new Error(`assignments ${s.slug}: ${error.message}`)

  const byTemplate = new Map(assignments.map((a) => [a.template_id, a.id]))
  const shape = SHAPES[s.shape]

  // trg_guard_submission_review rejects review columns from any caller that is
  // not an organizer of the school — the service role included, since
  // auth.uid() is null for it. So every submission is inserted in the state a
  // student could have produced, and the reviewed ones are then moved by a real
  // organizer session below (see reviewAsOrganizer).
  const submissions = []
  const toReview = []
  templates.forEach((t, i) => {
    const status = shape[i]
    if (!status) return
    const assignmentId = byTemplate.get(t.id)
    const reviewed = status === 'approved' || status === 'rejected'
    submissions.push({
      assignment_id: assignmentId,
      status: reviewed ? 'submitted' : status,
      submitted_at: status === 'draft' ? null : day(-6 + i),
    })
    if (reviewed) toReview.push({ assignmentId, status, at: day(-2 + i) })
  })
  if (submissions.length) await insert('submissions', submissions)
  pendingReviews.push(...toReview)

  // Back-date the reminder clock on the untouched forms so the pacing logic in
  // send-reminders has something to act on rather than starting from zero.
  const reminded = assignments
    .filter((a) => !submissions.some((sub) => sub.assignment_id === a.id))
    .map((a) => a.id)
  if (reminded.length) {
    const { error: err } = await db
      .from('assignments')
      .update({ last_reminded_at: day(-8) })
      .in('id', reminded)
    if (err) throw new Error(`last_reminded_at ${s.slug}: ${err.message}`)
  }
}

// Approvals and rejections, done the way the app does them: as the organizer,
// through RLS and the review guard. Anything wrong with the seeded shape fails
// here rather than producing rows the app could never have created.
const asOrganizer = createClient(url, anonKey, { auth: { persistSession: false } })
const { error: signInError } = await asOrganizer.auth.signInWithPassword({
  email: email('orga'),
  password: PASSWORD,
})
if (signInError) throw new Error(`organizer sign-in: ${signInError.message}`)

for (const r of pendingReviews) {
  const { error } = await asOrganizer
    .from('submissions')
    .update({
      status: r.status,
      reviewer_id: organizerId,
      reviewed_at: r.at,
      review_note: r.status === 'rejected'
        ? 'Document illisible, merci de le renvoyer.'
        : null,
    })
    .eq('assignment_id', r.assignmentId)
  if (error) throw new Error(`review ${r.assignmentId}: ${error.message}`)
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

console.log(`
Seeded ${where}.

  School      ${SCHOOL_NAME}
  Exchange    ${EXCHANGE_NAME}  (phase 2, applications open)
  Apply page  /apply/demo-2026
  Forms       ${templates.length}  (one overdue, one due in 3 days)
  Students    ${STUDENTS.length} enrolled, every completion state covered
  Applicants  ${applicationCount} rows — invited / draft / submitted / rejected / accepted / declined / enrolled

Logins (password: ${PASSWORD})
  organizer     ${email('orga')}       owner
  collaborator  ${email('orga-2')}     admin
  students      ${email('eleve-01')} … ${email('eleve-12')}

  eleve-01  nothing started        eleve-07  one form rejected
  eleve-03  everything approved    eleve-08  half done
  eleve-04  everything submitted   eleve-10  overdue
  eleve-05  mixed states           eleve-12  everything approved
${isLocal(url) ? '\n  All email lands in Inbucket: http://127.0.0.1:54324\n' : ''}`)
