import { describe, it, expect, vi, beforeEach } from 'vitest'

// getSubmissionForReview's fillable-PDF signed-URL branch: a generated_pdf_path
// on the submission should produce a signed download link; no path should
// leave generatedPdfUrl null (no needless storage round trip either).
let generatedPdfPath: string | null

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'organizer-1' } } }) },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string) => {
          if (bucket === 'documents' && path === generatedPdfPath) {
            return { data: { signedUrl: `https://signed.example/${path}` }, error: null }
          }
          return { data: null, error: null }
        },
      }),
    },
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        maybeSingle: async () => {
          // assertOrganizerOwnsAssignment's ownership check
          if (table === 'assignments') {
            return { data: { form_templates: { school_id: 'school-1', exchange_id: 'ex-1' } }, error: null }
          }
          if (table === 'submissions') {
            return {
              data: {
                id: 'sub-1',
                status: 'submitted',
                review_note: null,
                generated_pdf_path: generatedPdfPath,
                fillable_data: null,
                field_answers: [],
                document_uploads: [],
              },
              error: null,
            }
          }
          return { data: null, error: null }
        },
        single: async () => {
          // getSubmissionForReview's own assignment lookup
          if (table === 'assignments') {
            return { data: { id: 'a-1', student_id: 'stu-1', template_id: 'tmpl-1' }, error: null }
          }
          if (table === 'form_templates') {
            return {
              data: {
                id: 'tmpl-1', kind: 'fillable', type: 'data_entry', standard_key: null,
                exchange_id: 'ex-1', form_fields: [], document_slots: [],
              },
              error: null,
            }
          }
          if (table === 'users') {
            return {
              data: {
                id: 'organizer-1', role: 'organizer', school_id: 'school-1', status: 'approved',
                full_name: 'Jane Doe', email: 'jane@example.com', org_role: 'owner',
                locale: 'fr', schools: null,
              },
              error: null,
            }
          }
          return { data: null, error: null }
        },
      }
      return builder
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))

import { getSubmissionForReview } from '../submissions'

describe('getSubmissionForReview — generated PDF signed URL', () => {
  beforeEach(() => {
    generatedPdfPath = null
  })

  it('signs the generated PDF when generated_pdf_path is set', async () => {
    generatedPdfPath = 'a-1/generated.pdf'
    const result = await getSubmissionForReview('a-1')
    expect(result.generatedPdfUrl).toBe('https://signed.example/a-1/generated.pdf')
  })

  it('leaves generatedPdfUrl null when there is no generated_pdf_path', async () => {
    generatedPdfPath = null
    const result = await getSubmissionForReview('a-1')
    expect(result.generatedPdfUrl).toBeNull()
  })
})
