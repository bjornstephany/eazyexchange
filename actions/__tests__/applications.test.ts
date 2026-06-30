import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  exchange: any | null
  application: any | null
  inserted: any
  updated: any
}

function builder(table: string) {
  const b: any = {
    _filters: {} as Record<string, any>,
    select: () => b,
    eq: (col: string, val: any) => { b._filters[col] = val; return b },
    order: () => b,
    insert: (row: any) => { scenario.inserted = { table, row }; return {
      select: () => ({ single: async () => ({ data: { ...row, id: 'app-1' }, error: null }) }),
    } },
    update: (row: any) => { scenario.updated = { table, row }; return { eq: async () => ({ error: null }) } },
    single: async () => ({ data: rowFor(table), error: rowFor(table) ? null : { message: 'none' } }),
    maybeSingle: async () => ({ data: rowFor(table), error: null }),
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
  storage: { from: () => ({ upload: async () => ({ data: { path: 'app-1/photo.png' }, error: null }) }) },
  auth: { admin: {
    inviteUserByEmail: async () => ({ data: { user: { id: 'new-user' } }, error: null }),
    deleteUser: async () => ({ error: null }),
  } },
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => adminClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({
  sendApplicationResumeEmail: vi.fn(), sendApplicationConfirmationEmail: vi.fn(),
  sendNewApplicationAlertEmail: vi.fn(), sendInvitationEmail: vi.fn(), sendApplicationRejectionEmail: vi.fn(),
}))

import { startApplication, submitApplication, saveApplicationDraft, respondToInvitation } from '../applications'

beforeEach(() => {
  scenario = {
    exchange: { id: 'ex-1', name: 'France-Canada', school_a_id: 's-1', application_open: true, application_deadline: null },
    application: { id: 'app-1', exchange_id: 'ex-1', school_id: 's-1', status: 'draft', email: 'a@b.co', data: {} },
    inserted: null, updated: null,
  }
})

describe('startApplication', () => {
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
    expect(res.token).toBeTruthy()
    expect(scenario.inserted.table).toBe('applications')
    expect(scenario.inserted.row.status).toBe('draft')
  })
})

describe('saveApplicationDraft', () => {
  it('refuses to write a non-draft application', async () => {
    scenario.application.status = 'submitted'
    await expect(saveApplicationDraft('tok', { first_name: 'A' })).rejects.toThrow('locked')
  })
})

describe('submitApplication', () => {
  it('rejects when required fields are missing', async () => {
    await expect(submitApplication('tok', { first_name: 'A' })).rejects.toThrow('required')
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
})
