import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  exchange: any | null
  application: any | null
  applicationQueue: any[]          // consumed first by applications maybeSingle (for race tests)
  inserted: any
  insertError: any | null          // injected error for applications inserts
  updated: any
  enrollError: any | null
  deletedProfileUserId: string | null
  deletedAuthUserId: string | null
  rateLimitAllowed: boolean
}

function builder(table: string) {
  const b: any = {
    _filters: {} as Record<string, any>,
    select: () => b,
    eq: (col: string, val: any) => { b._filters[col] = val; return b },
    order: () => b,
    insert: (row: any) => {
      scenario.inserted = { table, row }
      const error = table === 'exchange_enrollments' ? (scenario.enrollError ?? null)
        : table === 'applications' ? (scenario.insertError ?? null) : null
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
    maybeSingle: async () => ({
      data: table === 'applications' && scenario.applicationQueue.length > 0
        ? scenario.applicationQueue.shift()
        : rowFor(table),
      error: null,
    }),
  }
  return b
}
function rowFor(table: string) {
  if (table === 'exchanges') return scenario.exchange
  if (table === 'applications') return scenario.application
  if (table === 'users') return [{ email: 'org@school.test' }]
  return null
}

const adminClient = {
  from: (t: string) => builder(t),
  storage: { from: () => ({
    upload: async () => ({ data: { path: 'app-1/photo.png' }, error: null }),
    createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed.example/${path}` }, error: null }),
  }) },
  auth: { admin: {
    inviteUserByEmail: async () => ({ data: { user: { id: 'new-user' } }, error: null }),
    deleteUser: async (id: string) => { scenario.deletedAuthUserId = id; return { error: null } },
  } },
  // Rate-limit check — controlled by scenario.rateLimitAllowed.
  rpc: async () => ({ data: scenario.rateLimitAllowed, error: null }),
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => adminClient }))
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => null }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({
  // startApplication now fire-and-forgets this (.catch on the return value), so
  // the mock must resolve like the real (async) implementation does.
  sendApplicationResumeEmail: vi.fn().mockResolvedValue(undefined),
  sendApplicationConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendNewApplicationAlertEmail: vi.fn().mockResolvedValue(undefined),
  sendInvitationEmail: vi.fn(), sendApplicationRejectionEmail: vi.fn(),
}))

import { startApplication, submitApplication, saveApplicationDraft, respondToInvitation, getApplicationDraft, sendApplicationResumeLink, peekApplicationDraft } from '../applications'
import { sendApplicationResumeEmail } from '@/lib/email'
import { allApplicationFields } from '@/lib/application-form'

function completeAppData(): Record<string, string> {
  const data: Record<string, string> = {}
  for (const f of allApplicationFields()) data[f.id] = 'x'
  data.email = 'a@b.co'
  data.family_status = 'married'
  return data
}

const PAST = new Date(Date.now() - 60_000).toISOString()

beforeEach(() => {
  vi.clearAllMocks()
  scenario = {
    exchange: { id: 'ex-1', name: 'France-Canada', school_a_id: 's-1', application_open: true, application_deadline: null },
    application: { id: 'app-1', exchange_id: 'ex-1', school_id: 's-1', status: 'draft', email: 'a@b.co', data: {} },
    inserted: null, updated: null, insertError: null, applicationQueue: [],
    enrollError: null, deletedProfileUserId: null, deletedAuthUserId: null,
    rateLimitAllowed: true,
  }
})

describe('startApplication', () => {
  beforeEach(() => { scenario.application = null })

  it('rejects an invalid email', async () => {
    await expect(startApplication('slug', { email: 'nope', first_name: 'A', last_name: 'B', language: 'en' }))
      .rejects.toThrow('valid email')
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
})

describe('getApplicationDraft', () => {
  it('returns an expired marker (no PII) for an expired resume link', async () => {
    scenario.application = { status: 'draft', data: { first_name: 'A' }, language: 'en', photo_path: null, exchange_id: 'ex-1', resume_token_expires_at: PAST }
    const res = await getApplicationDraft('tok') as any
    expect(res.expired).toBe(true)
    expect(res.data).toBeUndefined()
  })
  it('returns a submitted marker (no PII) once the application is no longer a draft', async () => {
    scenario.application = { status: 'submitted', data: { first_name: 'A' }, language: 'en', photo_path: null, exchange_id: 'ex-1', resume_token_expires_at: null }
    const res = await getApplicationDraft('tok') as any
    expect(res.submitted).toBe(true)
    expect(res.data).toBeUndefined()
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
})

describe('respondToInvitation', () => {
  beforeEach(() => {
    scenario.application = {
      id: 'app-1', exchange_id: 'ex-1', school_id: 's-1', status: 'accepted',
      email: 'a@b.co', invite_token: 'inv-1', data: { first_name: 'A', last_name: 'B' },
      enrolled_user_id: null,
    }
  })
  it('rejects a response through an expired invite link', async () => {
    scenario.application.invite_token_expires_at = PAST
    await expect(respondToInvitation('inv-1', 'yes', '')).rejects.toThrow('expired')
  })
  it('records a No without creating an account', async () => {
    await respondToInvitation('inv-1', 'no', '')
    expect(scenario.updated.table).toBe('applications')
    expect(scenario.updated.row.status).toBe('declined')
  })
  it('records a Maybe with a note', async () => {
    await respondToInvitation('inv-1', 'maybe', 'need to check dates')
    expect(scenario.updated.row.status).toBe('maybe')
    expect(scenario.updated.row.invite_response_note).toBe('need to check dates')
  })
  it('rejects a response for a non-invited application', async () => {
    scenario.application.status = 'submitted'
    await expect(respondToInvitation('inv-1', 'yes', '')).rejects.toThrow()
  })
  it('on Yes creates the account, enrolls, and marks enrolled', async () => {
    await respondToInvitation('inv-1', 'yes', '')
    expect(scenario.updated.row.status).toBe('enrolled')
    expect(scenario.updated.row.enrolled_user_id).toBe('new-user')
  })
  it('treats a Yes on an already-claimed (enrolling) invite as success, no second account', async () => {
    scenario.application.status = 'enrolling'
    await expect(respondToInvitation('inv-1', 'yes', '')).resolves.toBeUndefined()
    expect(scenario.deletedAuthUserId).toBeNull()
  })
  it('on a non-23505 enroll failure, rolls back the profile + auth user, then throws', async () => {
    scenario.enrollError = { code: '500', message: 'boom' }
    await expect(respondToInvitation('inv-1', 'yes', '')).rejects.toBeTruthy()
    expect(scenario.deletedProfileUserId).toBe('new-user')
    expect(scenario.deletedAuthUserId).toBe('new-user')
    // The application is NOT marked enrolled when enrollment failed — the claim
    // is released back to 'accepted' so the applicant can retry.
    expect(scenario.updated.row.status).toBe('accepted')
    expect(scenario.updated.row.enrolled_user_id).toBeUndefined()
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
