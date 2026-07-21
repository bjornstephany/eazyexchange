import { describe, it, expect, vi, beforeEach } from 'vitest'

const reminderMock = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/email', () => ({
  sendTemplateReminderEmail: (...a: unknown[]) => reminderMock(...a),
  sendChecklistEmail: vi.fn().mockResolvedValue(true),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ---- switchable state ----
let role = 'organizer'
let template: any
let assignments: any[] = []
let enrolledUsers: any[] = []
let exchange: any = { name: 'Espagne' }
const templateUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
const assignmentInsert = vi.fn().mockResolvedValue({ error: null })
const assignmentUpdate = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) })
const templateDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
const templateInsert = vi.fn().mockReturnValue({
  select: () => ({ single: async () => ({ data: { id: 'new-tpl' }, error: null }) }),
})

const from = vi.fn((table: string) => {
  if (table === 'users') {
    return {
      select: (cols: string) => ({
        eq: () => ({
          single: async () => ({ data: { school_id: 'school-1', role } }),
        }),
        in: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: enrolledUsers }) }) }),
      }),
    }
  }
  if (table === 'form_templates') {
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: template }), maybeSingle: async () => ({ data: template }) }) }),
      insert: templateInsert,
      update: templateUpdate,
      delete: templateDelete,
    }
  }
  if (table === 'document_slots') {
    return { insert: async () => ({ error: null }) }
  }
  if (table === 'assignments') {
    return {
      select: () => ({ eq: () => Promise.resolve({ data: assignments }) }),
      insert: assignmentInsert,
      update: assignmentUpdate,
    }
  }
  if (table === 'exchanges') {
    return { select: () => ({ eq: () => ({ single: async () => ({ data: exchange }), maybeSingle: async () => ({ data: { school_a_id: 'school-1', school_b_id: 'school-2' } }) }) }) }
  }
  if (table === 'exchange_enrollments') {
    return { select: () => ({ eq: () => Promise.resolve({ data: enrolledUsers.map(u => ({ user_id: u.id })) }) }) }
  }
  return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from,
    storage: { from: () => ({ upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: null }) }) },
  }),
}))

import { deleteTemplate, remindTemplate, createDraftTemplate, updateTemplateMeta, replaceTemplateFile } from '@/actions/forms'
import { MSG_DEADLINE_REQUIRED } from '@/lib/forms/template-result'

beforeEach(() => {
  vi.clearAllMocks()
  role = 'organizer'
  exchange = { name: 'Espagne' }
  enrolledUsers = []
  assignments = []
  template = {
    id: 'tpl-1', school_id: 'school-1', exchange_id: 'ex-1', name: 'Passeport',
    kind: 'doc', status: 'draft', audience: 'all', deadline: '2026-10-10',
    template_file_path: null, form_fields: [{ id: 'f1' }],
  }
})

describe('createDraftTemplate — structured results', () => {
  function fd(entries: Record<string, string>) {
    const f = new FormData()
    for (const [k, v] of Object.entries(entries)) f.set(k, v)
    return f
  }
  it('returns a structured error when the name is empty', async () => {
    const res = await createDraftTemplate(fd({ exchange_id: 'ex-1', kind: 'doc', name: '  ' }))
    expect(res).toEqual({ ok: false, message: 'Donnez un nom au modèle.' })
    expect(templateInsert).not.toHaveBeenCalled()
  })
  it('returns a structured error for a pdf kind without file', async () => {
    const res = await createDraftTemplate(fd({ exchange_id: 'ex-1', kind: 'pdf', name: 'Autorisation' }))
    expect(res).toEqual({ ok: false, message: 'Téléversez le PDF à faire signer.' })
  })
  it('returns the new id on success', async () => {
    const res = await createDraftTemplate(fd({ exchange_id: 'ex-1', kind: 'doc', name: 'Passeport' }))
    expect(res).toEqual({ ok: true, id: 'new-tpl' })
  })
})

describe('updateTemplateMeta / replaceTemplateFile — structured results', () => {
  it('updateTemplateMeta returns a structured error when the name is empty', async () => {
    const res = await updateTemplateMeta('tpl-1', { name: ' ', description: null, deadline: '2026-10-10', condition_label: null, external_url: null })
    expect(res).toEqual({ ok: false, message: 'Le nom ne peut pas être vide.' })
  })
  it('updateTemplateMeta refuses removing the deadline of an active template', async () => {
    template.status = 'active'
    const res = await updateTemplateMeta('tpl-1', { name: 'Passeport', description: null, deadline: null, condition_label: null, external_url: null })
    expect(res).toEqual({ ok: false, message: 'Un modèle actif doit garder une échéance.' })
  })
  it('updateTemplateMeta returns ok on success', async () => {
    const res = await updateTemplateMeta('tpl-1', { name: 'Passeport', description: null, deadline: '2026-10-10', condition_label: null, external_url: null })
    expect(res).toEqual({ ok: true })
  })
  it('updateTemplateMeta rejects a non-https external link', async () => {
    const res = await updateTemplateMeta('tpl-1', {
      name: 'ESTA', description: null, deadline: '2026-10-10', condition_label: null,
      external_url: 'http://esta.cbp.dhs.gov',
    })
    expect(res).toEqual({ ok: false, message: 'Le lien externe doit être une URL https:// (500 caractères max).' })
  })
  it('updateTemplateMeta rejects an overlong external link', async () => {
    const res = await updateTemplateMeta('tpl-1', {
      name: 'ESTA', description: null, deadline: '2026-10-10', condition_label: null,
      external_url: 'https://x.example/' + 'a'.repeat(500),
    })
    expect(res).toEqual({ ok: false, message: 'Le lien externe doit être une URL https:// (500 caractères max).' })
  })
  it('updateTemplateMeta persists a valid external link', async () => {
    const res = await updateTemplateMeta('tpl-1', {
      name: 'ESTA', description: null, deadline: '2026-10-10', condition_label: null,
      external_url: '  https://esta.cbp.dhs.gov  ',
    })
    expect(res).toEqual({ ok: true })
    expect(templateUpdate).toHaveBeenCalledWith(expect.objectContaining({ external_url: 'https://esta.cbp.dhs.gov' }))
  })
  it('replaceTemplateFile returns a structured error on a non-pdf template', async () => {
    const f = new FormData()
    f.set('template_id', 'tpl-1')
    f.set('file', new File(['x'], 'x.pdf', { type: 'application/pdf' }))
    const res = await replaceTemplateFile(f)  // template.kind is 'doc' in beforeEach
    expect(res).toEqual({ ok: false, message: 'Ce modèle n’a pas de PDF.' })
  })
})

describe('deleteTemplate', () => {
  it('deletes standard templates too (guard removed)', async () => {
    template.standard_key = 'passeport'
    await deleteTemplate('tpl-1')
    expect(templateDelete).toHaveBeenCalled()
  })
  it('deletes a custom template', async () => {
    template.standard_key = null
    await deleteTemplate('tpl-1')
    expect(templateDelete).toHaveBeenCalled()
  })
})

describe('remindTemplate', () => {
  const HOURS = 3600 * 1000
  it('emails incomplete assignees, skips completed and recently-reminded', async () => {
    template.status = 'active'
    assignments = [
      { id: 'a1', student_id: 's1', last_reminded_at: null, submissions: { status: null }, users: { email: 'a@x.fr', full_name: 'A' } },
      { id: 'a2', student_id: 's2', last_reminded_at: new Date(Date.now() - 2 * HOURS).toISOString(), submissions: { status: 'draft' }, users: { email: 'b@x.fr', full_name: 'B' } },
      { id: 'a3', student_id: 's3', last_reminded_at: new Date(Date.now() - 30 * HOURS).toISOString(), submissions: { status: 'rejected' }, users: { email: 'c@x.fr', full_name: 'C' } },
      { id: 'a4', student_id: 's4', last_reminded_at: null, submissions: { status: 'approved' }, users: { email: 'd@x.fr', full_name: 'D' } },
    ]
    const res = await remindTemplate('tpl-1')
    expect(res).toEqual({ reminded: 2, skipped: 1, failed: 0 })
    expect(reminderMock).toHaveBeenCalledTimes(2)
    expect(assignmentUpdate).toHaveBeenCalled()
  })
  it('counts failures without aborting the batch', async () => {
    template.status = 'active'
    assignments = [
      { id: 'a1', student_id: 's1', last_reminded_at: null, submissions: { status: null }, users: { email: 'a@x.fr', full_name: 'A' } },
      { id: 'a2', student_id: 's2', last_reminded_at: null, submissions: { status: null }, users: { email: 'b@x.fr', full_name: 'B' } },
    ]
    reminderMock.mockResolvedValueOnce(false)
    const res = await remindTemplate('tpl-1')
    expect(res).toEqual({ reminded: 1, skipped: 0, failed: 1 })
  })
})
