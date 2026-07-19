// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { renderFillablePdf } from '../fillable-pdf'
import { FILLABLE_DEFINITIONS } from '@/lib/forms/fillable'
import { resolveVariables } from '@/lib/forms/fillable/render'
import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'

const details: ProgramDetailsValues = {
  destination: 'le Minnesota, USA',
  travel_start: '2026-10-17', travel_end: '2026-11-02',
  chaperones: ['Polly STEPHANY', 'Chantal KERLOCH'],
  association_name: 'AGESSIA',
  sending_school_name: 'Lycée Georges Duby',
  receiving_school_name: 'Edina High School',
  proviseur_name: 'Mme Sharon MIRON HUGHES',
  sending_city: 'Luynes',
  absence_dates: ['le jeudi 19 octobre 2026'],
}

describe('renderFillablePdf', () => {
  it('renders a completed décharge to a PDF buffer', async () => {
    const def = FILLABLE_DEFINITIONS.decharge
    const buf = await renderFillablePdf({
      def,
      values: resolveVariables({ exchangeName: 'France-Minnesota 2026', details }),
      data: {
        answers: {
          parent1_name: 'Jean Dupont', parent2_name: 'Marie Dupont', student_name: 'Zoé Dupont',
          conduct_student_name: 'Zoé Dupont', parents_place: 'Luynes',
        },
        signatures: [
          { key: 'sig_parent1', role_label: 'Représentant légal 1', full_name: 'Jean Dupont', signed_at: '2026-07-19T10:00:00Z' },
          { key: 'sig_parent2', role_label: 'Représentant légal 2', full_name: 'Marie Dupont', signed_at: '2026-07-19T10:00:00Z' },
          { key: 'sig_student', role_label: 'Élève', full_name: 'Zoé Dupont', signed_at: '2026-07-19T10:00:00Z' },
        ],
      },
      meta: { exchangeName: 'France-Minnesota 2026', associationName: 'AGESSIA', submissionId: 'sub-123' },
    })
    expect(buf.length).toBeGreaterThan(5000)
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  }, 30_000)
})
