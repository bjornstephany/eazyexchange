import { describe, it, expect, vi, beforeEach } from 'vitest'

const profile = { id: 'org-1', school_id: 'school-1', role: 'organizer' as const, status: 'approved' as const, locale: 'fr' as const }
const requireOrganizer = vi.fn(async () => ({ user: { id: 'org-1' }, profile }))
vi.mock('@/lib/auth/require', () => ({
  requireOrganizer: (...a: unknown[]) => requireOrganizer(...(a as [])),
  requireUser: vi.fn(async () => ({ id: 'org-1' })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/exchange-guard', () => ({ assertExchangeWritable: vi.fn(async () => {}) }))

// A minimal query-builder double. `state` is rewritten per test.
const state = {
  exchange: null as null | { id: string; school_a_id: string; school_b_id: string | null; application_fields: unknown },
  applicationCount: 0,
  updates: [] as unknown[],
  bankInserts: [] as unknown[],
  rpcRows: [] as unknown[],
}
function table(name: string) {
  if (name === 'exchanges') {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: state.exchange }),
      update: (patch: unknown) => { state.updates.push(patch); return { eq: async () => ({ error: null }) } },
    }
    return builder
  }
  if (name === 'applications') {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      then: undefined,
    }
    builder.select = () => ({ eq: async () => ({ count: state.applicationCount, error: null }) })
    return builder
  }
  if (name === 'application_custom_questions') {
    return { insert: async (row: unknown) => { state.bankInserts.push(row); return { error: null } } }
  }
  throw new Error(`unexpected table ${name}`)
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: table, rpc: async () => ({ data: state.rpcRows, error: null }) }),
}))

import {
  getQuestionnaire, addQuestion, removeQuestion, editCustomQuestion,
  resetQuestionnaire, listQuestionSuggestions,
} from '../questionnaire'
import { standardQuestionnaire } from '@/lib/application-templates/library'
import { entryId, sectionEntries } from '@/lib/application-fields'

beforeEach(() => {
  vi.clearAllMocks()
  state.exchange = { id: 'ex-1', school_a_id: 'school-1', school_b_id: null, application_fields: null }
  state.applicationCount = 0
  state.updates = []
  state.bankInserts = []
  state.rpcRows = []
  requireOrganizer.mockResolvedValue({ user: { id: 'org-1' }, profile })
})

describe('getQuestionnaire', () => {
  it('materializes the standard questionnaire for an exchange that was never customized', async () => {
    const s = await getQuestionnaire('ex-1')
    expect(s.doc).toEqual(standardQuestionnaire())
    expect(s.locked).toBe(false)
    expect(s.questionCount).toBe(55)   // 54 built-ins + the portrait
  })

  it('locks the moment the exchange has any application', async () => {
    state.applicationCount = 12
    const s = await getQuestionnaire('ex-1')
    expect(s.locked).toBe(true)
    expect(s.applicationCount).toBe(12)
  })

  it("refuses another school's exchange", async () => {
    state.exchange = { id: 'ex-1', school_a_id: 'other-school', school_b_id: null, application_fields: null }
    await expect(getQuestionnaire('ex-1')).rejects.toThrow('Unauthorized')
  })
})

describe('removeQuestion', () => {
  it('persists the whole document with the question gone', async () => {
    const res = await removeQuestion('ex-1', 'hosting', 'pets')
    expect(res.ok).toBe(true)
    expect(sectionEntries((res as unknown as { doc: never }).doc as never, 'hosting' as never).map(entryId)).not.toContain('pets')
    expect(state.updates).toHaveLength(1)
  })

  it('cascades sex → gender_other', async () => {
    const res = await removeQuestion('ex-1', 'student', 'sex')
    const ids = sectionEntries((res as unknown as { doc: never }).doc as never, 'student' as never).map(entryId)
    expect(ids).not.toContain('sex')
    expect(ids).not.toContain('gender_other')
  })

  it('refuses to remove a locked question', async () => {
    expect(await removeQuestion('ex-1', 'student', 'email')).toEqual({ ok: false, reason: 'unknown_question' })
    expect(state.updates).toHaveLength(0)
  })

  it('refuses once the exchange has an application — the client is never trusted with the lock', async () => {
    state.applicationCount = 1
    expect(await removeQuestion('ex-1', 'hosting', 'pets')).toEqual({ ok: false, reason: 'locked' })
    expect(state.updates).toHaveLength(0)
  })

  it("refuses another school's exchange", async () => {
    state.exchange = { id: 'ex-1', school_a_id: 'other-school', school_b_id: null, application_fields: null }
    expect(await removeQuestion('ex-1', 'hosting', 'pets')).toEqual({ ok: false, reason: 'not_found' })
    expect(state.updates).toHaveLength(0)
  })
})

describe('addQuestion', () => {
  it('restores a removed built-in by reference', async () => {
    await removeQuestion('ex-1', 'hosting', 'pets')
    state.exchange!.application_fields = (state.updates[0] as { application_fields: unknown }).application_fields
    const res = await addQuestion('ex-1', 'hosting', { kind: 'builtin', ref: 'pets' })
    expect(res.ok).toBe(true)
    const entries = sectionEntries((res as unknown as { doc: never }).doc as never, 'hosting' as never)
    expect(entries.at(-1)).toEqual({ ref: 'pets' })   // new questions land at the end
  })

  it('refuses a built-in that is already present', async () => {
    expect(await addQuestion('ex-1', 'hosting', { kind: 'builtin', ref: 'pets' }))
      .toEqual({ ok: false, reason: 'unknown_question' })
  })

  it('creates a custom question with a generated id and the 150-char cap on long text', async () => {
    const res = await addQuestion('ex-1', 'student', {
      kind: 'custom', label: 'Sait nager ?', type: 'textarea', required: true,
    })
    expect(res.ok).toBe(true)
    const added = sectionEntries((res as unknown as { doc: never }).doc as never, 'student' as never).at(-1) as {
      id: string; type: string; label: string; required: boolean; maxLength: number
    }
    expect(added.id).toMatch(/^c_[0-9a-f]{4}$/)
    expect(added).toMatchObject({ type: 'textarea', label: 'Sait nager ?', required: true, maxLength: 150 })
  })

  it("banks a newly created custom question for the organizer's school and locale", async () => {
    await addQuestion('ex-1', 'student', { kind: 'custom', label: '  Sait nager ?  ', type: 'yesno', required: false })
    expect(state.bankInserts).toEqual([
      { school_id: 'school-1', label: 'Sait nager ?', locale: 'fr', type: 'yesno', options: null },
    ])
  })

  it('never banks a restored built-in', async () => {
    await removeQuestion('ex-1', 'hosting', 'pets')
    state.exchange!.application_fields = (state.updates[0] as { application_fields: unknown }).application_fields
    await addQuestion('ex-1', 'hosting', { kind: 'builtin', ref: 'pets' })
    expect(state.bankInserts).toEqual([])
  })

  it('tokenizes choice options so a stored answer never depends on the wording', async () => {
    const res = await addQuestion('ex-1', 'student', {
      kind: 'custom', label: 'Régime', type: 'radio', required: false,
      options: ['Végétarien', '  ', 'Aucun'],
    })
    const added = sectionEntries((res as unknown as { doc: never }).doc as never, 'student' as never).at(-1) as {
      options: { value: string; label: string }[]
    }
    expect(added.options).toEqual([{ value: 'o1', label: 'Végétarien' }, { value: 'o2', label: 'Aucun' }])
  })

  it('rejects a blank or over-long label', async () => {
    expect(await addQuestion('ex-1', 'student', { kind: 'custom', label: '   ', type: 'text', required: false }))
      .toEqual({ ok: false, reason: 'invalid_label' })
    expect(await addQuestion('ex-1', 'student', { kind: 'custom', label: 'x'.repeat(121), type: 'text', required: false }))
      .toEqual({ ok: false, reason: 'invalid_label' })
  })

  it('rejects an unsupported type', async () => {
    expect(await addQuestion('ex-1', 'student', { kind: 'custom', label: 'X', type: 'file' as never, required: false }))
      .toEqual({ ok: false, reason: 'invalid_type' })
  })

  it('rejects a choice question with fewer than two options', async () => {
    expect(await addQuestion('ex-1', 'student', { kind: 'custom', label: 'X', type: 'radio', required: false, options: ['Seul'] }))
      .toEqual({ ok: false, reason: 'invalid_options' })
  })

  it('a bank write failure never costs the organizer their question', async () => {
    // The bank is a nice-to-have; the questionnaire is the product.
    const res = await addQuestion('ex-1', 'student', { kind: 'custom', label: 'X', type: 'text', required: false })
    expect(res.ok).toBe(true)
  })
})

describe('editCustomQuestion', () => {
  it('rewrites the label, required flag and options in place', async () => {
    const added = await addQuestion('ex-1', 'student', { kind: 'custom', label: 'Ancien', type: 'text', required: false })
    state.exchange!.application_fields = (state.updates.at(-1) as { application_fields: unknown }).application_fields
    const id = (sectionEntries((added as unknown as { doc: never }).doc as never, 'student' as never).at(-1) as { id: string }).id
    const res = await editCustomQuestion('ex-1', 'student', { id, label: 'Nouveau', required: true })
    const edited = sectionEntries((res as unknown as { doc: never }).doc as never, 'student' as never).at(-1) as {
      label: string; required: boolean
    }
    expect(edited).toMatchObject({ label: 'Nouveau', required: true })
  })

  it('refuses to edit a built-in — their labels and required-ness are not editable', async () => {
    expect(await editCustomQuestion('ex-1', 'student', { id: 'last_name', label: 'Surname', required: false }))
      .toEqual({ ok: false, reason: 'unknown_question' })
  })
})

describe('resetQuestionnaire', () => {
  it('writes NULL back — the same state as an exchange that was never customized', async () => {
    const res = await resetQuestionnaire('ex-1')
    expect(res).toEqual({ ok: true, doc: standardQuestionnaire() })
    expect(state.updates).toEqual([{ application_fields: null }])
  })

  it('refuses once locked', async () => {
    state.applicationCount = 3
    expect(await resetQuestionnaire('ex-1')).toEqual({ ok: false, reason: 'locked' })
    expect(state.updates).toHaveLength(0)
  })
})

describe('listQuestionSuggestions', () => {
  it('maps RPC aggregates onto the client shape', async () => {
    state.rpcRows = [{ label: 'Sait nager ?', type: 'yesno', options: null, schools: 7 }]
    expect(await listQuestionSuggestions()).toEqual([
      { label: 'Sait nager ?', type: 'yesno', options: null, schools: 7 },
    ])
  })

  it('returns an empty list rather than throwing when the bank is empty', async () => {
    state.rpcRows = []
    expect(await listQuestionSuggestions()).toEqual([])
  })

  it('drops a row whose type is not one of the five offered', async () => {
    state.rpcRows = [{ label: 'X', type: 'file', options: null, schools: 9 }]
    expect(await listQuestionSuggestions()).toEqual([])
  })
})
