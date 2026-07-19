// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { renderFillablePdf } from '../fillable-pdf'
import { FILLABLE_DEFINITIONS } from '@/lib/forms/fillable'
import { resolveVariables } from '@/lib/forms/fillable/render'
import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'
import type { FillableData } from '@/types/db'

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

const meta = { exchangeName: 'France-Minnesota 2026', associationName: 'AGESSIA', submissionId: 'sub-123' }
const values = resolveVariables({ exchangeName: meta.exchangeName, details })

// Fixture data per definition key. Each exercises field/radio/check blocks
// where the definition has them, plus at least one completed signature —
// and, per definition, leaves at least one optional field/check/signature
// untouched so the empty-answer / untouched-signature branches render too.
const FIXTURES: Record<string, FillableData> = {
  decharge: {
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
  absence: {
    // Exercises 'radio' (regime) and leaves it answered; signature completed.
    answers: {
      parent_name: 'Jean Dupont', student_name: 'Zoé Dupont', regime: 'externe', place: 'Luynes',
    },
    signatures: [
      { key: 'sig_parent', role_label: 'Parent / responsable légal', full_name: 'Jean Dupont', signed_at: '2026-07-19T10:00:00Z' },
    ],
  },
  famille: {
    // Exercises 'check' (four legal-consent boxes) — leave one unchecked to
    // render the unchecked-box path, and leave the mother's signature
    // untouched to exercise the untouched-required-signature branch.
    answers: {
      student_name: 'Zoé Dupont',
      accept_conditions: 'true',
      accept_responsibility: 'true',
      wish_participation: 'true',
      accept_committee: 'false',
    },
    signatures: [
      { key: 'sig_pere', role_label: 'Père', full_name: 'Jean Dupont', signed_at: '2026-07-19T10:00:00Z' },
      { key: 'sig_eleve', role_label: 'Élève', full_name: 'Zoé Dupont', signed_at: '2026-07-19T10:00:00Z' },
    ],
  },
  medical: {
    // Exercises 'field' (phone/textarea) — leaves father_phone and
    // medical_needs empty to render the empty-field '—' path.
    answers: {
      host_family: '', child_name: 'Zoé Dupont', mother_phone: '06 12 34 56 78', father_phone: '', medical_needs: '',
    },
    signatures: [
      { key: 'sig_father', role_label: 'Father / Père', full_name: 'Jean Dupont', signed_at: '2026-07-19T10:00:00Z' },
      { key: 'sig_mother', role_label: 'Mother / Mère', full_name: 'Marie Dupont', signed_at: '2026-07-19T10:00:00Z' },
    ],
  },
}

describe('renderFillablePdf', () => {
  it.each(Object.entries(FILLABLE_DEFINITIONS))('renders a completed %s to a PDF buffer', async (key, def) => {
    const data = FIXTURES[key]
    expect(data, `missing fixture for definition key "${key}"`).toBeDefined()
    const buf = await renderFillablePdf({ def, values, data, meta })
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(3000)
  }, 30_000)
})
