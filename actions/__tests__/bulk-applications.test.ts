import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  exchange: any | null
  applications: Record<string, any>
  profile: any
  /** The exchange_program_details row that fills the acceptance email's
   *  {{travel_dates}} &c. Null models an organizer who never filled Réglages,
   *  which the send guard must refuse. */
  details: any | null
}

/** Every row written by an update, keyed by application id — lets a test
 *  assert that each accepted application got its own invite token. */
let updates: { id: string; row: any }[] = []

function builder(table: string) {
  const b: any = {
    _filters: {} as Record<string, any>,
    _in: null as null | { col: string; vals: any[] },
    select: () => b,
    eq: (col: string, val: any) => { b._filters[col] = val; return b },
    // `.in()` resolves to a row LIST, so the builder itself is thenable.
    in: (col: string, vals: any[]) => { b._in = { col, vals }; return b },
    then: (onFulfilled: any, onRejected?: any) => {
      const ids: string[] = b._in?.vals ?? []
      const data =
        table === 'applications'
          ? ids.map(id => scenario.applications[id]).filter(Boolean)
          : table === 'exchange_program_details'
            ? (scenario.details && ids.includes(scenario.exchange?.id)
                ? [{ ...scenario.details, exchange_id: scenario.exchange.id }] : [])
            : ids.includes(scenario.exchange?.id) ? [scenario.exchange] : []
      return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected)
    },
    order: () => b,
    update: (row: any) => {
      // Return a thenable update object
      const updateObj = {
        eq: (col: string, val: any) => {
          b._filters[col] = val
          if (table === 'applications' && col === 'id') updates.push({ id: val, row })
          return updateObj
        },
        then: (onFulfilled: any, onRejected?: any) => {
          // Make this properly thenable for await
          return Promise.resolve({ error: null }).then(onFulfilled, onRejected)
        },
      }
      return updateObj
    },
    async single() {
      if (table === 'users') return { data: scenario.profile, error: null }
      if (table === 'exchanges') return { data: scenario.exchange, error: null }
      const appId = b._filters.id
      const app = scenario.applications[appId]
      return { data: app, error: app ? null : { message: 'none' } }
    },
    async maybeSingle() {
      if (table === 'users') return { data: scenario.profile, error: null }
      if (table === 'exchanges') return { data: scenario.exchange, error: null }
      const appId = b._filters.id
      const app = scenario.applications[appId]
      return { data: app, error: null }
    },
  }
  return b
}

const supabaseClient = {
  from: (t: string) => builder(t),
  auth: {
    getUser: async () => ({
      data: { user: { id: 'user-1' } },
      error: null,
    }),
  },
  rpc: async () => ({ data: true, error: null }),
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => supabaseClient }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => supabaseClient }))
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => null }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
let events: any[] = []
vi.mock('@/lib/communication/events', () => ({
  recordCommunicationEvent: vi.fn(async (_client: unknown, entry: any) => { events.push(entry) }),
}))
vi.mock('@/lib/email', () => ({
  sendApplicationResumeEmail: vi.fn(async () => {}),
  sendApplicationConfirmationEmail: vi.fn(async () => {}),
  sendNewApplicationAlertEmail: vi.fn(async () => {}),
  sendInvitationEmail: vi.fn(async () => {}),
  sendApplicationRejectionEmail: vi.fn(async () => {}),
  sendGoodNewsEmail: vi.fn(async () => true),
}))

import { revalidatePath } from 'next/cache'
import { sendGoodNewsEmail } from '@/lib/email'
import { acceptApplications, rejectApplications, acceptApplication } from '../applications-review'

beforeEach(() => {
  vi.clearAllMocks()
  updates = []
  events = []
  scenario = {
    exchange: { id: 'ex-1', name: 'France-Canada', school_id: 's-1', good_news_subject: null, good_news_body: null },
    profile: { id: 'user-1', school_id: 's-1', role: 'organizer', status: 'approved' },
    // Complete by default: these tests are about the review engine, not the
    // send guard, and an incomplete row would block every one of them.
    details: {
      travel_start: '2027-04-12', travel_end: '2027-04-26',
      participation_cost: '850 € par élève',
      payment_details: 'https://helloasso.example/adhesion',
      confirmation_deadline: '2027-01-15',
    },
    applications: {
      'app-ok': { id: 'app-ok', exchange_id: 'ex-1', school_id: 's-1', status: 'submitted', email: 'stu@b.co', language: 'fr', data: { first_name: 'A', last_name: 'B', father_email: 'dad@b.co', mother_email: 'mom@b.co' } },
      'app-noparent': { id: 'app-noparent', exchange_id: 'ex-1', school_id: 's-1', status: 'submitted', email: 'stu2@b.co', language: 'fr', data: { first_name: 'C', last_name: 'D' } },
    },
  }
})

describe('acceptApplications', () => {
  it('accepts each id and reports partial failure', async () => {
    const res = await acceptApplications(['app-ok', 'app-bad'])
    expect(res).toEqual({ succeeded: 1, failed: 1, blocked: null })
    // Application status feeds the dashboard rollups — an accept must
    // invalidate the router cache for /dashboard too.
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
  })

  it('empty input is a no-op', async () => {
    expect(await acceptApplications([])).toEqual({ succeeded: 0, failed: 0, blocked: null })
  })

  // The batch fetches every application in one read and writes them
  // concurrently — the guards below have to survive that, per id.
  it('mints a distinct invite token per accepted application', async () => {
    await acceptApplications(['app-ok', 'app-noparent'])
    const tokens = updates.map(u => u.row.invite_token)
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toBeTruthy()
    expect(new Set(tokens).size).toBe(2)
  })

  it('skips applications belonging to another school', async () => {
    scenario.applications['app-foreign'] = {
      ...scenario.applications['app-ok'], id: 'app-foreign', school_id: 's-2',
    }
    const res = await acceptApplications(['app-ok', 'app-foreign'])
    expect(res).toEqual({ succeeded: 1, failed: 1, blocked: null })
    expect(updates.map(u => u.id)).toEqual(['app-ok'])
  })

  it('keeps the status guard per id in a mixed selection', async () => {
    // 'invited' was never submitted; 'accepted' is already accepted.
    scenario.applications['app-invited'] = { ...scenario.applications['app-ok'], id: 'app-invited', status: 'invited' }
    scenario.applications['app-done'] = { ...scenario.applications['app-ok'], id: 'app-done', status: 'accepted' }
    const res = await acceptApplications(['app-ok', 'app-invited', 'app-done'])
    expect(res).toEqual({ succeeded: 1, failed: 2, blocked: null })
    expect(updates.map(u => u.id)).toEqual(['app-ok'])
  })

  it('refuses the whole batch when the exchange is archived', async () => {
    scenario.exchange = { ...scenario.exchange, archived_at: '2026-01-01T00:00:00Z' }
    const res = await acceptApplications(['app-ok', 'app-noparent'])
    expect(res).toEqual({ succeeded: 0, failed: 2, blocked: null })
    expect(updates).toEqual([])
  })
})

describe('rejectApplications', () => {
  it('rejects each id with the shared note', async () => {
    const res = await rejectApplications(['app-ok'], 'note', false)
    expect(res).toEqual({ succeeded: 1, failed: 0, blocked: null })
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
  })

  it('empty input is a no-op', async () => {
    expect(await rejectApplications([], 'note', false)).toEqual({ succeeded: 0, failed: 0, blocked: null })
  })
})

describe('acceptApplication good-news email', () => {
  it('emails the parents (father + mother) with the rendered template', async () => {
    await acceptApplication('app-ok')
    expect(sendGoodNewsEmail).toHaveBeenCalledTimes(1)
    const arg = (sendGoodNewsEmail as any).mock.calls[0][0]
    expect(arg.to).toEqual(['dad@b.co', 'mom@b.co'])
    expect(arg.language).toBe('fr')
    expect(arg.respondUrl).toContain('/invite/')
  })

  it('falls back to the student email when no parent email is present', async () => {
    await acceptApplication('app-noparent')
    const arg = (sendGoodNewsEmail as any).mock.calls[0][0]
    expect(arg.to).toEqual(['stu2@b.co'])
  })
})

describe('acceptApplication (single, change-of-mind)', () => {
  it('un-rejects and threads the personal note into the good-news email', async () => {
    scenario.applications['app-rejected'] = {
      ...scenario.applications['app-ok'], id: 'app-rejected', status: 'rejected',
    }
    await acceptApplication('app-rejected', { personalNote: 'Une place s’est libérée !' })
    expect(updates.map(u => u.id)).toEqual(['app-rejected'])
    expect(updates[0].row.status).toBe('accepted')
    expect(sendGoodNewsEmail).toHaveBeenCalledWith(
      expect.objectContaining({ personalNote: 'Une place s’est libérée !' }),
    )
  })

  it('refuses to accept an application the student declined', async () => {
    scenario.applications['app-declined'] = {
      ...scenario.applications['app-ok'], id: 'app-declined', status: 'declined',
    }
    await expect(acceptApplication('app-declined')).rejects.toThrow(
      'Only a submitted application can be accepted',
    )
    expect(updates).toEqual([])
    expect(sendGoodNewsEmail).not.toHaveBeenCalled()
  })

  it('sends no personal note when none was given', async () => {
    await acceptApplication('app-ok')
    expect(sendGoodNewsEmail).toHaveBeenCalledWith(
      expect.objectContaining({ personalNote: null }),
    )
  })

  it('bulk accept never carries a personal note', async () => {
    await acceptApplications(['app-ok'])
    expect(sendGoodNewsEmail).toHaveBeenCalledWith(
      expect.objectContaining({ personalNote: null }),
    )
  })
})

// The « Bonne nouvelle » email is the entire point of accepting: shipping one
// that still says « [à compléter] » to a family is the failure this guard
// exists to prevent. A blocked accept must therefore write NOTHING — no status
// change, no invite token, no email, no history entry — so the organizer can
// fill Réglages and retry against an untouched application.
describe('accept refuses a template with unfilled placeholders', () => {
  it('blocks and touches nothing when Réglages was never filled', async () => {
    scenario.details = null
    const res = await acceptApplication('app-ok')
    expect(res.ok).toBe(false)
    expect(updates).toEqual([])
    expect(sendGoodNewsEmail).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })

  it('names every missing value so the organizer knows what to fill', async () => {
    scenario.details = null
    const res = await acceptApplication('app-ok')
    expect(res).toEqual({
      ok: false,
      blocked: {
        missing: ['travel_dates', 'participation_cost', 'payment_details', 'confirmation_deadline'],
        literal: false,
      },
    })
  })

  it('names only the values actually missing', async () => {
    scenario.details = { ...scenario.details, participation_cost: null, payment_details: '  ' }
    const res = await acceptApplication('app-ok')
    expect(res).toEqual({
      ok: false,
      blocked: { missing: ['participation_cost', 'payment_details'], literal: false },
    })
  })

  it('blocks a hand-typed placeholder even with Réglages complete', async () => {
    scenario.exchange = {
      ...scenario.exchange,
      good_news_body: 'Bonjour, le séjour coûte [montant à confirmer].',
    }
    const res = await acceptApplication('app-ok')
    expect(res).toEqual({ ok: false, blocked: { missing: [], literal: true } })
    expect(updates).toEqual([])
  })

  // The organizer who abandoned the tokens and typed the values into the body
  // is done — refusing them because three columns are empty would be a lie.
  it('allows a custom body that hard-codes the values, Réglages empty', async () => {
    scenario.details = null
    scenario.exchange = {
      ...scenario.exchange,
      good_news_body: 'Départ le 12 avril, 850 € — réponse avant le 15 janvier.',
    }
    const res = await acceptApplication('app-ok')
    expect(res).toEqual({ ok: true })
    expect(sendGoodNewsEmail).toHaveBeenCalledTimes(1)
  })

  it('reports a bulk block once, not once per candidate', async () => {
    scenario.details = null
    const res = await acceptApplications(['app-ok', 'app-noparent'])
    expect(res.succeeded).toBe(0)
    expect(res.failed).toBe(2)
    expect(res.blocked?.missing).toContain('participation_cost')
    expect(updates).toEqual([])
  })

  // Rejections send a different email, one with no template and no placeholders.
  it('never blocks a rejection', async () => {
    scenario.details = null
    const res = await rejectApplications(['app-ok'], 'non', false)
    expect(res).toMatchObject({ succeeded: 1, failed: 0 })
  })

  it('hands the details through to the email when they are complete', async () => {
    await acceptApplication('app-ok')
    expect(sendGoodNewsEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ participation_cost: '850 € par élève' }),
      }),
    )
  })
})

describe('accept records a good_news_sent event with the real send outcome', () => {
  it('records ok per accepted application, named and application-scoped', async () => {
    await acceptApplications(['app-ok', 'app-noparent'])
    expect(events).toHaveLength(2)
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        exchangeId: 'ex-1', kind: 'good_news_sent',
        applicationId: 'app-ok', subject: 'A B', status: 'ok',
      }),
      expect.objectContaining({
        applicationId: 'app-noparent', subject: 'C D', status: 'ok',
      }),
    ]))
  })

  // A history that says "sent" for a mail that bounced is worse than no
  // history: the send result has to be awaited, not fire-and-forget.
  it('records failed when the send returns false', async () => {
    vi.mocked(sendGoodNewsEmail).mockResolvedValue(false)
    await acceptApplications(['app-ok'])
    expect(events[0]).toMatchObject({ kind: 'good_news_sent', status: 'failed' })
  })

  // rejectApplications(ids, note, sendEmail) — positional, per
  // actions/applications-review.ts:317.
  it('a rejection records nothing', async () => {
    await rejectApplications(['app-ok'], 'non', true)
    expect(events).toHaveLength(0)
  })
})
