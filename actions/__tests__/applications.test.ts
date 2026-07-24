import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  exchange: any | null
  application: any | null
  applicationQueue: any[]          // consumed first by applications maybeSingle (for race tests)
  inserted: any
  inserts: any[]                   // every insert in call order (inserted = last)
  insertError: any | null          // injected error for applications inserts
  updated: any
  updates: any[]                   // every update in call order (updated = last)
  enrollError: any | null
  deletedProfileUserId: string | null
  deletedAuthUserId: string | null
  rateLimitAllowed: boolean
  applicationCount: number
  profileInsertError: any | null   // injected error for users-table inserts
  createUserAttrs: any | null      // captured attrs of auth.admin.createUser
  createUserResult: any            // returned by auth.admin.createUser
  generateLinkAttrs: any | null    // captured attrs of auth.admin.generateLink
  generateLinkResult: any          // returned by auth.admin.generateLink
  generateLinkResults: any[]       // consumed first, one per call (for retry tests)
  generateLinkCalls: number        // how many times auth.admin.generateLink was called
  verifyOtpAttrs: any | null       // captured attrs of auth.verifyOtp
  verifyOtpResult: any             // returned by auth.verifyOtp
  userProfile: any | null          // routes rowFor('users') for getInvitation's maybeSingle lookup
  enrolledElsewhere: any | null    // routes the has-account guard maybeSingle (school_id+email, no exchange_id, enrolled_user_id not null)
}

function builder(table: string) {
  const b: any = {
    _filters: {} as Record<string, any>,
    select: (_cols?: string, opts?: { count?: 'exact'; head?: boolean }) => {
      // startApplication's cap check: .select('id', { count: 'exact', head: true }).eq(…)
      if (opts?.head) return { eq: async () => ({ count: scenario.applicationCount, error: null }) }
      return b
    },
    eq: (col: string, val: any) => { b._filters[col] = val; return b },
    neq: (col: string, val: any) => { b._filters['neq_' + col] = val; return b },
    not: () => b,
    limit: () => b,
    order: () => b,
    insert: (row: any) => {
      scenario.inserted = { table, row }
      scenario.inserts.push({ table, row })
      const error = table === 'exchange_enrollments' ? (scenario.enrollError ?? null)
        : table === 'applications' ? (scenario.insertError ?? null)
        : table === 'users' ? (scenario.profileInsertError ?? null) : null
      return {
        error,
        // startApplication chains .select('id').single() on the insert
        select: () => ({ single: async () => ({ data: error ? null : { ...row, id: 'app-1' }, error }) }),
        // respondToInvitation awaits the insert directly for { error }
        then: (resolve: any) => resolve({ error }),
      }
    },
    update: (row: any) => {
      scenario.updated = { table, row }
      scenario.updates.push({ table, row })
      // Chainable supporting .eq().eq(), .eq().in().select().maybeSingle(), and
      // a direct await (thenable). maybeSingle honors an .in(col, [...]) guard
      // against the current row so the atomic-claim path can "miss".
      const u: any = {
        _in: null as null | { col: string; vals: any[] },
        eq() { return u },
        in(col: string, vals: any[]) { u._in = { col, vals }; return u },
        select() { return u },
        async maybeSingle() {
          const r = rowFor(table)
          if (u._in && r && !u._in.vals.includes(r[u._in.col])) return { data: null, error: null }
          return { data: r, error: null }
        },
        then: (resolve: any) => resolve({ error: null }),
      }
      return u
    },
    delete: () => ({ eq: async (_col: string, val: any) => { scenario.deletedProfileUserId = val; return { error: null } } }),
    single: async () => ({ data: rowFor(table), error: rowFor(table) ? null : { message: 'none' } }),
    maybeSingle: async () => {
      if (table === 'applications') {
        // The has-account guard query filters school_id + email but NOT exchange_id
        // (it uses .neq('exchange_id', …) → recorded as neq_exchange_id, plus a
        // .not('enrolled_user_id','is',null) that the mock treats as a no-op).
        // Route it to enrolledElsewhere so it can hit/miss independently of the
        // queue and of the same-exchange lookup (which sets _filters.exchange_id).
        const f = b._filters
        if (f.school_id !== undefined && f.email !== undefined && f.exchange_id === undefined) {
          return { data: scenario.enrolledElsewhere, error: null }
        }
        if (scenario.applicationQueue.length > 0) return { data: scenario.applicationQueue.shift(), error: null }
        return { data: scenario.application, error: null }
      }
      return { data: rowFor(table), error: null }
    },
  }
  return b
}
function rowFor(table: string) {
  if (table === 'exchanges') return scenario.exchange
  if (table === 'applications') return scenario.application
  if (table === 'users') return scenario.userProfile ?? [{ email: 'org@school.test' }]
  return null
}

const adminClient = {
  from: (t: string) => builder(t),
  storage: { from: () => ({
    upload: async () => ({ data: { path: 'app-1/photo.png' }, error: null }),
    createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed.example/${path}` }, error: null }),
  }) },
  auth: {
    admin: {
      createUser: async (attrs: any) => { scenario.createUserAttrs = attrs; return scenario.createUserResult },
      generateLink: async (attrs: any) => {
        scenario.generateLinkAttrs = attrs
        scenario.generateLinkCalls++
        // A queued result models a flaky auth endpoint across retries; falling
        // back to generateLinkResult keeps every pre-existing scenario valid.
        return scenario.generateLinkResults.length
          ? scenario.generateLinkResults.shift()
          : scenario.generateLinkResult
      },
      deleteUser: async (id: string) => { scenario.deletedAuthUserId = id; return { error: null } },
    },
    // The cookie-aware server client is mocked to this same object, so the
    // in-action session mint's verifyOtp lands here.
    verifyOtp: async (attrs: any) => { scenario.verifyOtpAttrs = attrs; return scenario.verifyOtpResult },
  },
  // Rate-limit check — controlled by scenario.rateLimitAllowed.
  rpc: async () => ({ data: scenario.rateLimitAllowed, error: null }),
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => adminClient }))
// peekApplicationDraft now reads via the anon-key RPC (W3). The RPC returns the
// flattened first_name column, not the raw application row — translate the
// scenario fixture so the existing peek scenarios stay valid.
vi.mock('@/lib/supabase/anon', () => ({
  createAnonClient: () => ({
    rpc: (fn: string) => ({
      maybeSingle: async () => {
        if (fn !== 'peek_application_draft') return { data: null, error: null }
        const a = scenario.application
        if (!a) return { data: null, error: null }
        const first = (a.data as Record<string, unknown> | null)?.first_name
        return {
          data: {
            status: a.status,
            first_name: typeof first === 'string' ? first : null,
            language: a.language,
            resume_token_expires_at: a.resume_token_expires_at,
          },
          error: null,
        }
      },
    }),
  }),
}))
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => null }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({
  // startApplication now fire-and-forgets this (.catch on the return value), so
  // the mock must resolve like the real (async) implementation does.
  sendApplicationResumeEmail: vi.fn().mockResolvedValue(undefined),
  sendApplicationConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendNewApplicationAlertEmail: vi.fn().mockResolvedValue(undefined),
  sendInvitationEmail: vi.fn(), sendApplicationRejectionEmail: vi.fn(),
  sendChecklistEmail: vi.fn().mockResolvedValue(true),
  sendStudentSetupEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/email-log', () => ({ logEmailSend: vi.fn().mockResolvedValue(undefined) }))

import { startApplication, submitApplication, saveApplicationDraft, getApplicationDraft, sendApplicationResumeLink, peekApplicationDraft } from '../apply'
import { respondToInvitation, getInvitation } from '../invitations'
import { sendApplicationResumeEmail, sendStudentSetupEmail } from '@/lib/email'
import { logEmailSend } from '@/lib/email-log'
import { allApplicationFields } from '@/lib/application-form'

function completeAppData(): Record<string, string> {
  const data: Record<string, string> = {}
  for (const f of allApplicationFields()) data[f.id] = 'x'
  // Contact fields need real shapes: submitApplication format-checks every
  // email/tel field, so a blanket 'x' would be rejected before it ever writes.
  for (const f of allApplicationFields()) {
    if (f.type === 'email') data[f.id] = 'a@b.co'
    if (f.type === 'tel') data[f.id] = '0612345678'
  }
  data.family_status = 'married'
  return data
}

const PAST = new Date(Date.now() - 60_000).toISOString()

beforeEach(() => {
  vi.clearAllMocks()
  scenario = {
    exchange: { id: 'ex-1', name: 'France-Canada', school_a_id: 's-1', application_open: true, application_deadline: null },
    application: { id: 'app-1', exchange_id: 'ex-1', school_id: 's-1', status: 'draft', email: 'a@b.co', data: {} },
    inserted: null, inserts: [], updated: null, updates: [], insertError: null, applicationQueue: [],
    enrollError: null, deletedProfileUserId: null, deletedAuthUserId: null,
    rateLimitAllowed: true, applicationCount: 0,
    profileInsertError: null,
    createUserAttrs: null,
    createUserResult: { data: { user: { id: 'new-user' } }, error: null },
    generateLinkAttrs: null,
    generateLinkResults: [],
    generateLinkCalls: 0,
    generateLinkResult: { data: { properties: { hashed_token: 'hash-1' } }, error: null },
    verifyOtpAttrs: null,
    verifyOtpResult: { data: { session: {} }, error: null },
    userProfile: null,
    enrolledElsewhere: null,
  }
})

describe('startApplication', () => {
  beforeEach(() => { scenario.application = null })

  it('returns a structured result for an invalid email', async () => {
    await expect(startApplication('slug', { email: 'nope', first_name: 'A', last_name: 'B', language: 'en' }))
      .resolves.toEqual({ invalidEmail: true })
  })
  it('rejects when the exchange is closed', async () => {
    scenario.exchange.application_open = false
    await expect(startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' }))
      .rejects.toThrow('closed')
  })
  it('creates a draft and returns its resume token', async () => {
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect('token' in res && res.token).toBeTruthy()
    expect(scenario.inserted.table).toBe('applications')
    expect(scenario.inserted.row.status).toBe('draft')
  })
  it('fire-and-forget emails the resume link on start (cross-device safety net)', async () => {
    await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(sendApplicationResumeEmail).toHaveBeenCalledTimes(1)
    const arg = (sendApplicationResumeEmail as any).mock.calls[0][0]
    expect(arg.to).toBe('a@b.co')
    expect(arg.resumeUrl).toContain('/apply/resume/')
  })
  it('rejects when the rate limit is exceeded', async () => {
    scenario.rateLimitAllowed = false
    await expect(startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' }))
      .rejects.toThrow('Too many attempts')
    expect(scenario.inserted).toBeNull()
  })
  it('still resolves with a token when the fire-and-forget resume email rejects', async () => {
    (sendApplicationResumeEmail as any).mockRejectedValueOnce(new Error('mail down'))
    await expect(startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' }))
      .resolves.toMatchObject({ token: expect.any(String) })
  })

  it('with an existing draft: no insert, resume email re-sent to the existing token, token never returned', async () => {
    scenario.application = { id: 'app-9', status: 'draft', resume_token: 'tok-existing' }
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(res).toEqual({ existing: 'draft' })
    expect(scenario.inserted).toBeNull()
    expect(sendApplicationResumeEmail).toHaveBeenCalledTimes(1)
    expect((sendApplicationResumeEmail as any).mock.calls[0][0].resumeUrl).toContain('tok-existing')
    // keeps the re-sent link alive
    expect(scenario.updated.table).toBe('applications')
    expect(scenario.updated.row.resume_token_expires_at).toBeTruthy()
  })

  it('with a submitted application: { existing: "submitted" }, no insert, no email', async () => {
    scenario.application = { id: 'app-9', status: 'submitted', resume_token: 'tok-existing' }
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(res).toEqual({ existing: 'submitted' })
    expect(scenario.inserted).toBeNull()
    expect(sendApplicationResumeEmail).not.toHaveBeenCalled()
  })

  it('with a rejected application: same neutral "submitted" response (rejection is final, never advertised)', async () => {
    scenario.application = { id: 'app-9', status: 'rejected', resume_token: 'tok-existing' }
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(res).toEqual({ existing: 'submitted' })
    expect(scenario.inserted).toBeNull()
    expect(sendApplicationResumeEmail).not.toHaveBeenCalled()
  })

  it('maps a 23505 insert race to the winning row status', async () => {
    // Pre-check misses (null), insert hits the unique index, re-read finds the winner.
    scenario.applicationQueue = [null, { status: 'submitted' }]
    scenario.insertError = { code: '23505', message: 'duplicate key' }
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(res).toEqual({ existing: 'submitted' })
  })

  it('maps a 23505 race against a draft winner to { existing: "draft" }', async () => {
    scenario.applicationQueue = [null, { status: 'draft', resume_token: 'tok-winner' }]
    scenario.insertError = { code: '23505', message: 'duplicate key' }
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(res).toEqual({ existing: 'draft' })
  })

  it('rate limit still fires before the resend path (no email even when a draft exists)', async () => {
    scenario.application = { id: 'app-9', status: 'draft', resume_token: 'tok-existing' }
    scenario.rateLimitAllowed = false
    await expect(startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' }))
      .rejects.toThrow('Too many attempts')
    expect(sendApplicationResumeEmail).not.toHaveBeenCalled()
  })

  it('at the per-exchange cap: { closed: true }, no insert, no email', async () => {
    scenario.applicationCount = 2000
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(res).toEqual({ closed: true })
    expect(scenario.inserted).toBeNull()
    expect(sendApplicationResumeEmail).not.toHaveBeenCalled()
  })
  it('one under the cap still inserts', async () => {
    scenario.applicationCount = 1999
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect('token' in res).toBe(true)
  })
  it('an existing draft is still resumable past the cap (cap only blocks new rows)', async () => {
    scenario.applicationCount = 2000
    scenario.application = { id: 'app-1', status: 'draft', resume_token: 'tok-old' }
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(res).toEqual({ existing: 'draft' })
  })

  it('blocks a new application when the email is already enrolled in another exchange in the school', async () => {
    scenario.enrolledElsewhere = { id: 'app-other', enrolled_user_id: 'user-x' }
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(res).toEqual({ registered: true })
    expect(scenario.inserted).toBeNull()
    expect(sendApplicationResumeEmail).not.toHaveBeenCalled()
  })

  it('does NOT block a new application when a prior application in another exchange is not enrolled (one application per exchange)', async () => {
    // The has-account guard filters enrolled_user_id IS NOT NULL, so a non-enrolled
    // prior elsewhere yields no match — represented by enrolledElsewhere staying null.
    scenario.enrolledElsewhere = null
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect('token' in res).toBe(true)
    expect(scenario.inserted.table).toBe('applications')
  })
})

describe('saveApplicationDraft', () => {
  it('refuses to write a non-draft application', async () => {
    scenario.application.status = 'submitted'
    await expect(saveApplicationDraft('tok', { first_name: 'A' })).rejects.toThrow('locked')
  })
  it('refuses to write through an expired resume link', async () => {
    scenario.application.status = 'draft'
    scenario.application.resume_token_expires_at = PAST
    await expect(saveApplicationDraft('tok', { first_name: 'A' })).rejects.toThrow('expired')
  })
  it('rejects an over-limit profile answer with a structured result and writes nothing', async () => {
    const res = await saveApplicationDraft('tok', { lived_abroad: 'x'.repeat(151) })
    expect(res).toEqual({ ok: false, overLimit: ['lived_abroad'] })
    expect(scenario.updated).toBeNull()
  })
  it('returns ok:true after a successful draft save', async () => {
    scenario.application = { id: 'app-1', status: 'draft', resume_token_expires_at: null, exchange_id: 'ex-1' }
    const res = await saveApplicationDraft('tok', { first_name: 'A' })
    expect(res).toEqual({ ok: true })
  })
  it('does not format-check drafts — a half-typed number must still autosave', async () => {
    scenario.application = { id: 'app-1', status: 'draft', resume_token_expires_at: null, exchange_id: 'ex-1' }
    const res = await saveApplicationDraft('tok', { cell_phone: '06 12', father_email: 'marie@' })
    expect(res).toEqual({ ok: true })
  })
})

describe('getApplicationDraft', () => {
  it('returns an expired marker (no PII) for an expired resume link', async () => {
    scenario.application = { status: 'draft', data: { first_name: 'A' }, language: 'en', photo_path: null, exchange_id: 'ex-1', resume_token_expires_at: PAST }
    const res = await getApplicationDraft('tok') as any
    expect(res.expired).toBe(true)
    expect(res.data).toBeUndefined()
  })
  it('returns a submitted marker with NO PII once the application is submitted', async () => {
    // The post-submit resume page must never receive the answers or the photo:
    // it renders an "already submitted" notice plus a recap-download button, and
    // `language` is the one non-marker field it needs (carries no PII).
    scenario.application = { status: 'submitted', data: { first_name: 'A' }, language: 'fr', photo_path: 'app-1/photo.jpg', exchange_id: 'ex-1', resume_token_expires_at: null, submitted_at: '2026-07-01T10:00:00Z' }
    const res = await getApplicationDraft('tok') as any
    expect(res.submitted).toBe(true)
    expect(res.language).toBe('fr')
    expect(res.data).toBeUndefined()
    expect(res.photoUrl).toBeUndefined()
  })
  it('still hides PII behind an expired link even when submitted', async () => {
    scenario.application = { status: 'submitted', data: { first_name: 'A' }, language: 'fr', photo_path: null, exchange_id: 'ex-1', resume_token_expires_at: PAST }
    const res = await getApplicationDraft('tok') as any
    expect(res.expired).toBe(true)
    expect(res.data).toBeUndefined()
    expect(res.photoUrl).toBeUndefined()
  })
})

describe('sendApplicationResumeLink', () => {
  it('emails the resume link for an open draft', async () => {
    scenario.application = { email: 'a@b.co', status: 'draft', resume_token_expires_at: null }
    await sendApplicationResumeLink('tok')
    expect(sendApplicationResumeEmail).toHaveBeenCalledTimes(1)
  })
  it('refuses once the application has been submitted', async () => {
    scenario.application = { email: 'a@b.co', status: 'submitted', resume_token_expires_at: null }
    await expect(sendApplicationResumeLink('tok')).rejects.toThrow('already been submitted')
    expect(sendApplicationResumeEmail).not.toHaveBeenCalled()
  })
  it('refuses through an expired resume link', async () => {
    scenario.application = { email: 'a@b.co', status: 'draft', resume_token_expires_at: PAST }
    await expect(sendApplicationResumeLink('tok')).rejects.toThrow('expired')
    expect(sendApplicationResumeEmail).not.toHaveBeenCalled()
  })
  it('rejects when the rate limit is exceeded', async () => {
    scenario.application = { email: 'a@b.co', status: 'draft', resume_token_expires_at: null }
    scenario.rateLimitAllowed = false
    await expect(sendApplicationResumeLink('tok')).rejects.toThrow('Too many attempts')
    expect(sendApplicationResumeEmail).not.toHaveBeenCalled()
  })
})

describe('submitApplication', () => {
  it('rejects when required fields are missing', async () => {
    await expect(submitApplication('tok', { first_name: 'A' })).rejects.toThrow('required')
  })
  it('rejects a complete submission that has no photo', async () => {
    scenario.application = { id: 'app-1', status: 'draft', email: 'a@b.co', exchange_id: 'ex-1', school_id: 's-1', resume_token_expires_at: null, photo_path: null }
    await expect(submitApplication('tok', completeAppData())).rejects.toThrow('required')
    expect(scenario.updated).toBeNull()
  })
  it('submits a complete application that has a photo', async () => {
    scenario.application = { id: 'app-1', status: 'draft', email: 'a@b.co', exchange_id: 'ex-1', school_id: 's-1', resume_token_expires_at: null, photo_path: 'app-1/photo.jpg' }
    await submitApplication('tok', completeAppData())
    expect(scenario.updated.table).toBe('applications')
    expect(scenario.updated.row.status).toBe('submitted')
  })
  it('rejects a malformed parent e-mail with a structured result and writes nothing', async () => {
    // The address that would otherwise 422 the whole acceptance send later.
    scenario.application = { id: 'app-1', status: 'draft', email: 'a@b.co', exchange_id: 'ex-1', school_id: 's-1', resume_token_expires_at: null, photo_path: 'app-1/photo.jpg' }
    const res = await submitApplication('tok', { ...completeAppData(), father_email: 'marie@gmial' })
    expect(res).toEqual({ ok: false, invalidFormat: ['father_email'] })
    expect(scenario.updated).toBeNull()
  })
  it('rejects a malformed phone with a structured result', async () => {
    scenario.application = { id: 'app-1', status: 'draft', email: 'a@b.co', exchange_id: 'ex-1', school_id: 's-1', resume_token_expires_at: null, photo_path: 'app-1/photo.jpg' }
    const res = await submitApplication('tok', { ...completeAppData(), cell_phone: 'io' })
    expect(res).toEqual({ ok: false, invalidFormat: ['cell_phone'] })
    expect(scenario.updated).toBeNull()
  })
  it('accepts a spaced French mobile number', async () => {
    scenario.application = { id: 'app-1', status: 'draft', email: 'a@b.co', exchange_id: 'ex-1', school_id: 's-1', resume_token_expires_at: null, photo_path: 'app-1/photo.jpg' }
    await submitApplication('tok', { ...completeAppData(), cell_phone: '06 12 34 56 78' })
    expect(scenario.updated.row.status).toBe('submitted')
  })
  it('rejects an over-limit profile answer with a structured result and writes nothing', async () => {
    const res = await submitApplication('tok', { ...completeAppData(), sports: 'x'.repeat(151) })
    expect(res).toEqual({ ok: false, overLimit: ['sports'] })
    expect(scenario.updated).toBeNull()
  })
  it('returns ok:true on a successful submission', async () => {
    scenario.application = { id: 'app-1', status: 'draft', email: 'a@b.co', exchange_id: 'ex-1', school_id: 's-1', resume_token_expires_at: null, photo_path: 'app-1/photo.jpg' }
    const res = await submitApplication('tok', completeAppData())
    expect(res).toEqual({ ok: true })
  })
  it('blocks submission when the email became enrolled in another exchange (race backstop)', async () => {
    scenario.application = { id: 'app-1', status: 'draft', email: 'a@b.co', exchange_id: 'ex-1', school_id: 's-1', resume_token_expires_at: null, photo_path: 'app-1/photo.jpg' }
    scenario.enrolledElsewhere = { id: 'app-other', enrolled_user_id: 'user-x' }
    const res = await submitApplication('tok', completeAppData())
    expect(res).toEqual({ ok: false, registered: true })
    expect(scenario.updated).toBeNull()
  })
})

describe('respondToInvitation', () => {
  beforeEach(() => {
    scenario.application = {
      id: 'app-1', exchange_id: 'ex-1', school_id: 's-1', status: 'accepted',
      email: 'a@b.co', invite_token: 'inv-1', data: { first_name: 'A', last_name: 'B' },
      enrolled_user_id: null,
    }
  })
  it('returns a structured expired error through an expired invite link', async () => {
    scenario.application.invite_token_expires_at = PAST
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toMatchObject({ ok: false, error: 'expired' })
  })
  it('records a No without creating an account', async () => {
    const res = await respondToInvitation('inv-1', 'no', '')
    expect(res).toEqual({ ok: true })
    expect(scenario.updated.table).toBe('applications')
    expect(scenario.updated.row.status).toBe('declined')
    expect(scenario.createUserAttrs).toBeNull()
  })
  it('records a Maybe with a note', async () => {
    const res = await respondToInvitation('inv-1', 'maybe', 'need to check dates')
    expect(res).toEqual({ ok: true })
    expect(scenario.updated.row.status).toBe('maybe')
    expect(scenario.updated.row.invite_response_note).toBe('need to check dates')
  })
  it('returns closed for a non-invited application', async () => {
    scenario.application.status = 'submitted'
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toMatchObject({ ok: false, error: 'closed' })
  })
  it('on Yes creates a confirmed account, enrolls, finalizes, and emails the STUDENT a setup link (no parent session)', async () => {
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toEqual({ ok: true })
    expect(scenario.createUserAttrs).toMatchObject({ email: 'a@b.co', email_confirm: true })
    expect(scenario.updated.row.status).toBe('enrolled')
    expect(scenario.updated.row.enrolled_user_id).toBe('new-user')
    // A magiclink is generated to build the student's /auth/confirm setup URL...
    expect(scenario.generateLinkAttrs).toMatchObject({ type: 'magiclink', email: 'a@b.co' })
    // ...and mailed to the student — but the PARENT is never signed in here.
    expect(sendStudentSetupEmail).toHaveBeenCalledTimes(1)
    const arg = (sendStudentSetupEmail as any).mock.calls[0][0]
    expect(arg.to).toBe('a@b.co')
    expect(arg.setupUrl).toContain('/auth/confirm?token_hash=hash-1')
    expect(arg.setupUrl).toContain('type=magiclink')
    expect(arg.setupUrl).toContain('next=%2Faccept-invite')
    expect(scenario.verifyOtpAttrs).toBeNull()
  })
  it('a Yes on an already-claimed (enrolling) invite is idempotent — no second account, no resend', async () => {
    scenario.application.status = 'enrolling'
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toEqual({ ok: true })
    expect(scenario.createUserAttrs).toBeNull()
    expect(sendStudentSetupEmail).not.toHaveBeenCalled()
    expect(scenario.verifyOtpAttrs).toBeNull()
  })
  it('a Yes on an already-enrolled invite is idempotent success', async () => {
    scenario.application.status = 'enrolled'
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toEqual({ ok: true })
    expect(scenario.createUserAttrs).toBeNull()
    expect(sendStudentSetupEmail).not.toHaveBeenCalled()
  })
  it('a failing student setup email does not fail the confirmation (best-effort)', async () => {
    scenario.generateLinkResult = { data: null, error: { message: 'boom' } }
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toEqual({ ok: true })
    // enrollment was still finalized
    expect(scenario.updates.some((u) => u.row.status === 'enrolled')).toBe(true)
  })
  // Supabase auth intermittently 403s service-role calls to /admin/generate_link
  // ("bad_jwt"). A single blip used to cost the student their only route to an
  // account — silently, with no trace anywhere. Retry, then record the loss.
  it('retries a transient generateLink failure and still emails the student', async () => {
    scenario.generateLinkResults = [
      { data: null, error: { status: 403, code: 'bad_jwt', message: 'invalid JWT' } },
      { data: { properties: { hashed_token: 'hash-2' } }, error: null },
    ]
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toEqual({ ok: true })
    expect(scenario.generateLinkCalls).toBe(2)
    expect(sendStudentSetupEmail).toHaveBeenCalledTimes(1)
    expect((sendStudentSetupEmail as any).mock.calls[0][0].setupUrl).toContain('token_hash=hash-2')
    expect(logEmailSend).not.toHaveBeenCalled()
  })
  it('logs an email_send_log error row when every generateLink attempt fails', async () => {
    scenario.generateLinkResult = { data: null, error: { status: 403, code: 'bad_jwt', message: 'invalid JWT' } }
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toEqual({ ok: true })
    expect(scenario.generateLinkCalls).toBe(3)
    expect(sendStudentSetupEmail).not.toHaveBeenCalled()
    // The loss must be queryable — email_send_log is the operational trail.
    expect(logEmailSend).toHaveBeenCalledTimes(1)
    expect((logEmailSend as any).mock.calls[0][0]).toMatchObject({
      recipient: 'a@b.co', kind: 'student setup email', status: 'error', errorCode: 403,
      schoolId: 's-1', exchangeId: 'ex-1',
    })
  })
  it('returns email_exists and releases the claim when the auth account already exists', async () => {
    scenario.createUserResult = { data: { user: null }, error: { code: 'email_exists', message: 'exists' } }
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toMatchObject({ ok: false, error: 'email_exists' })
    expect(scenario.updated.row.status).toBe('accepted')  // claim released
  })
  it('maps a 23505 profile-insert race to email_exists and rolls back the auth user', async () => {
    scenario.profileInsertError = { code: '23505', message: 'duplicate key' }
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toMatchObject({ ok: false, error: 'email_exists' })
    expect(scenario.deletedAuthUserId).toBe('new-user')
    expect(scenario.updated.row.status).toBe('accepted')
  })
  it('on a non-23505 enroll failure, rolls back the profile + auth user, then throws (unexpected)', async () => {
    scenario.enrollError = { code: '500', message: 'boom' }
    await expect(respondToInvitation('inv-1', 'yes', '')).rejects.toBeTruthy()
    expect(scenario.deletedProfileUserId).toBe('new-user')
    expect(scenario.deletedAuthUserId).toBe('new-user')
    expect(scenario.updated.row.status).toBe('accepted')
    expect(scenario.updated.row.enrolled_user_id).toBeUndefined()
  })
  it('on Yes stamps terms_acknowledged_at on the claim', async () => {
    await respondToInvitation('inv-1', 'yes', '')
    const claim = scenario.updates.find(u => u.table === 'applications' && u.row.status === 'enrolling')
    expect(claim?.row.terms_acknowledged_at).toBeTruthy()
  })
  it('seeds users.locale from the application language', async () => {
    scenario.application.language = 'de'
    await respondToInvitation('inv-1', 'yes', '')
    const profile = scenario.inserts.find(i => i.table === 'users')
    expect(profile?.row).toMatchObject({ role: 'student', locale: 'de' })
  })
  it('falls back to the default locale when the row carries an unsupported code', async () => {
    scenario.application.language = 'pt'
    await respondToInvitation('inv-1', 'yes', '')
    const profile = scenario.inserts.find(i => i.table === 'users')
    expect(profile?.row).toMatchObject({ locale: 'en' })
  })
  it('No and Maybe never set terms_acknowledged_at', async () => {
    await respondToInvitation('inv-1', 'no', '')
    expect(scenario.updated.row.terms_acknowledged_at).toBeUndefined()
    await respondToInvitation('inv-1', 'maybe', '')
    expect(scenario.updated.row.terms_acknowledged_at).toBeUndefined()
  })
})

describe('getInvitation setup state', () => {
  it('reports setupComplete: null for a not-yet-answered invite', async () => {
    scenario.application = { status: 'accepted', data: { first_name: 'A' }, invite_token_expires_at: null, enrolled_user_id: null, exchanges: { name: 'X' } }
    const res = await getInvitation('inv-1')
    expect(res?.setupComplete).toBeNull()
  })
  it('reports setupComplete: false for an enrolled invite whose profile has no name yet', async () => {
    scenario.application = { status: 'enrolled', data: {}, invite_token_expires_at: null, enrolled_user_id: 'stu-1', exchanges: { name: 'X' } }
    scenario.userProfile = { full_name: '' }
    const res = await getInvitation('inv-1')
    expect(res?.setupComplete).toBe(false)
  })
  it('reports setupComplete: false while enrolling with no user row yet', async () => {
    scenario.application = { status: 'enrolling', data: {}, invite_token_expires_at: null, enrolled_user_id: null, exchanges: { name: 'X' } }
    const res = await getInvitation('inv-1')
    expect(res?.setupComplete).toBe(false)
  })
  it('reports setupComplete: true once the profile has a full name', async () => {
    scenario.application = { status: 'enrolled', data: {}, invite_token_expires_at: null, enrolled_user_id: 'stu-1', exchanges: { name: 'X' } }
    scenario.userProfile = { full_name: 'Léa Martin' }
    const res = await getInvitation('inv-1')
    expect(res?.setupComplete).toBe(true)
  })
})

describe('peekApplicationDraft', () => {
  it('reports a live draft with its first name and language (no other PII)', async () => {
    scenario.application = { status: 'draft', data: { first_name: 'Léa', last_name: 'Martin', email: 'a@b.co' }, language: 'fr', resume_token_expires_at: null }
    const res = await peekApplicationDraft('tok')
    expect(res).toEqual({ live: true, firstName: 'Léa', language: 'fr' })
  })
  it('reports not-live for a submitted application and leaks no name', async () => {
    scenario.application = { status: 'submitted', data: { first_name: 'Léa' }, language: 'fr', resume_token_expires_at: null }
    const res = await peekApplicationDraft('tok')
    expect(res).toEqual({ live: false, firstName: null, language: 'fr' })
  })
  it('reports not-live for an expired resume token', async () => {
    scenario.application = { status: 'draft', data: { first_name: 'Léa' }, language: 'en', resume_token_expires_at: PAST }
    const res = await peekApplicationDraft('tok')
    expect(res.live).toBe(false)
    expect(res.firstName).toBeNull()
  })
  it('reports not-live for a missing token', async () => {
    scenario.application = null
    const res = await peekApplicationDraft('tok')
    expect(res).toEqual({ live: false, firstName: null, language: 'en' })
  })
})

describe('getApplicationDraft slug', () => {
  it('returns the exchange apply_slug for a live draft', async () => {
    scenario.application = { status: 'draft', data: { first_name: 'A' }, language: 'en', photo_path: null, exchange_id: 'ex-1', resume_token_expires_at: null, exchanges: { name: 'France-Canada', apply_slug: 'france-canada' } }
    const res = await getApplicationDraft('tok') as any
    expect(res.slug).toBe('france-canada')
  })
  it('returns a signed photo URL for a draft that already has a photo', async () => {
    scenario.application = { status: 'draft', data: {}, language: 'en', photo_path: 'app-1/photo.jpg', resume_token_expires_at: null, exchanges: { name: 'X', apply_slug: 'x' } }
    const res = await getApplicationDraft('tok') as any
    expect(res.photoUrl).toBe('https://signed.example/app-1/photo.jpg')
  })
  it('returns a null photo URL when no photo was uploaded yet', async () => {
    scenario.application = { status: 'draft', data: {}, language: 'en', photo_path: null, resume_token_expires_at: null, exchanges: { name: 'X', apply_slug: 'x' } }
    const res = await getApplicationDraft('tok') as any
    expect(res.photoUrl).toBeNull()
  })
})
