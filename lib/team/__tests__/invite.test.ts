import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendOrganizerInviteEmail = vi.fn()
vi.mock('@/lib/email', () => ({ sendOrganizerInviteEmail: (...a: unknown[]) => sendOrganizerInviteEmail(...a) }))
vi.mock('@/lib/tokens', () => ({ randomToken: () => 'tok-123' }))

import { createAndSendOrganizerInvite } from '@/lib/team/invite'

type Row = Record<string, unknown>
let existingMember: Row | null
let existingInvite: Row | null
let insertError: unknown
let deleted: string[]
let inserted: Row | null

function makeAdmin() {
  deleted = []; inserted = null
  return {
    from(table: string) {
      if (table === 'users') return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingMember }) }) }) }),
      }
      if (table === 'schools') return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { name: 'Lincoln High' } }) }) }),
      }
      if (table === 'organizer_invites') return {
        select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ is: () => ({ gt: () => ({ maybeSingle: async () => ({ data: existingInvite }) }) }) }) }) }) }),
        insert: (row: Row) => { inserted = row; return { select: () => ({ single: async () => ({ data: insertError ? null : { id: 'inv-1' }, error: insertError ?? null }) }) } },
        delete: () => ({ eq: (_c: string, id: string) => { deleted.push(id); return Promise.resolve({ error: null }) } }),
      }
      throw new Error('unexpected table ' + table)
    },
  } as never
}

const opts = { schoolId: 's-1', email: 'New@School.fr', inviterUserId: 'u1', inviterName: 'Alice', appUrl: 'https://app.test' }

beforeEach(() => {
  existingMember = null; existingInvite = null; insertError = null
  sendOrganizerInviteEmail.mockReset().mockResolvedValue(true)
})

describe('createAndSendOrganizerInvite', () => {
  it('normalizes the email, inserts a pending row, and sends the email', async () => {
    const r = await createAndSendOrganizerInvite(makeAdmin(), opts)
    expect(r).toEqual({ ok: true })
    expect(inserted).toMatchObject({ school_id: 's-1', email: 'new@school.fr', token: 'tok-123', invited_by: 'u1' })
    expect(sendOrganizerInviteEmail).toHaveBeenCalledWith({
      to: 'new@school.fr', inviterName: 'Alice', schoolName: 'Lincoln High',
      joinUrl: 'https://app.test/join/tok-123',
      ctx: { schoolId: 's-1' },
    })
  })

  it('rejects an invalid email without inserting', async () => {
    const r = await createAndSendOrganizerInvite(makeAdmin(), { ...opts, email: 'not-an-email' })
    expect(r).toEqual({ ok: false, message: 'Adresse e-mail invalide.' })
  })

  it('rejects an email that already belongs to a member', async () => {
    existingMember = { id: 'u9' }
    const r = await createAndSendOrganizerInvite(makeAdmin(), opts)
    expect(r).toEqual({ ok: false, message: 'Cette personne fait déjà partie de votre équipe.' })
  })

  it('rejects an email that already has a pending invite', async () => {
    existingInvite = { id: 'inv-0' }
    const r = await createAndSendOrganizerInvite(makeAdmin(), opts)
    expect(r).toEqual({ ok: false, message: 'Une invitation est déjà en attente pour cette adresse.' })
  })

  it('rolls back the pending row when the email fails', async () => {
    sendOrganizerInviteEmail.mockResolvedValueOnce(false)
    const admin = makeAdmin()
    const r = await createAndSendOrganizerInvite(admin, opts)
    expect(r).toEqual({ ok: false, message: 'L’e-mail d’invitation n’a pas pu être envoyé. Réessayez.' })
    expect(deleted).toEqual(['inv-1'])
  })
})
