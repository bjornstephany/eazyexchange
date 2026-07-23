// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { namespaceTranslator, type AppTranslator } from '@/lib/i18n/messages'
import { recapSections, renderApplicationRecapPdf } from '../application-recap'

let FR: AppTranslator
let EN: AppTranslator
beforeAll(async () => {
  FR = await namespaceTranslator('fr', 'apply')
  EN = await namespaceTranslator('en', 'apply')
})

// A 1x1 transparent PNG — smallest thing that exercises the real image path.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const ANSWERS: Record<string, string> = {
  first_name: 'Zoé', last_name: 'Dupont',
  native_language: 'français',
  smoking_home: 'no',
  own_room: 'yes',
  family_status: 'step_family',
  sports: '   ',            // whitespace only → must be skipped
  not_a_real_field: 'x',    // not in APPLICATION_SECTIONS → must be ignored
}

function rows(sections: ReturnType<typeof recapSections>) {
  return sections.flatMap(s => s.rows)
}

describe('recapSections', () => {
  it('uses the section + field labels of the requested language', () => {
    const fr = recapSections(ANSWERS, FR)
    expect(fr.map(s => s.title)).toContain('Élève')
    expect(rows(fr)).toContainEqual({ label: 'Prénom', value: 'Zoé' })

    const en = recapSections(ANSWERS, EN)
    expect(en.map(s => s.title)).toContain('Student')
    expect(rows(en)).toContainEqual({ label: 'First name', value: 'Zoé' })
  })

  it('resolves yesno answers to their localized labels', () => {
    expect(rows(recapSections(ANSWERS, FR))).toContainEqual(
      { label: 'Fume-t-on à la maison ?', value: 'Non' },
    )
    expect(rows(recapSections(ANSWERS, EN))).toContainEqual(
      { label: 'Does anyone smoke in the home?', value: 'No' },
    )
  })

  it('resolves radio answers through their option labels, not raw values', () => {
    expect(rows(recapSections(ANSWERS, FR))).toContainEqual(
      { label: 'Situation familiale', value: 'Famille recomposée' },
    )
    expect(rows(recapSections(ANSWERS, EN))).toContainEqual(
      { label: 'Family status', value: 'Step-family' },
    )
    expect(rows(recapSections(ANSWERS, FR)).map(r => r.value)).not.toContain('step_family')
  })

  it('skips empty and whitespace-only answers, and ignores unknown keys', () => {
    const labels = rows(recapSections(ANSWERS, FR)).map(r => r.label)
    expect(labels).not.toContain('Sports pratiqués et heures par semaine')
    expect(rows(recapSections(ANSWERS, FR)).map(r => r.value)).not.toContain('x')
  })

  it('omits a section entirely when none of its fields are answered', () => {
    // ANSWERS has nothing from the "Student profile" / "Profil de l’élève" section.
    expect(recapSections(ANSWERS, FR).map(s => s.title)).not.toContain('Profil de l’élève')
  })

  it('returns no sections at all for an empty answers map', () => {
    expect(recapSections({}, FR)).toEqual([])
  })
})

describe('renderApplicationRecapPdf', () => {
  // A function, not a constant: the translator is only ready in beforeAll.
  const base = () => ({
    exchangeName: 'France-Minnesota 2026',
    applicantName: 'Zoé Dupont',
    submittedAt: '2026-07-19T10:00:00Z' as string | null,
    data: ANSWERS,
    locale: 'fr' as const,
    t: FR,
  })

  it('renders a non-empty PDF without a photo', async () => {
    const buf = await renderApplicationRecapPdf({ ...base(), photoBytes: null })
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(3000)
  }, 30_000)

  it('renders a PDF with a PNG photo embedded', async () => {
    const buf = await renderApplicationRecapPdf({ ...base(), photoBytes: new Uint8Array(PNG_1X1) })
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(3000)
  }, 30_000)

  it('drops an unsupported image format instead of throwing', async () => {
    // WebP ("RIFF....WEBP") — @react-pdf embeds only PNG and JPEG.
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ])
    const buf = await renderApplicationRecapPdf({ ...base(), photoBytes: webp })
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  }, 30_000)

  it('renders when there are no answers and no submission date', async () => {
    const buf = await renderApplicationRecapPdf({
      ...base(), data: {}, submittedAt: null, photoBytes: null,
    })
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  }, 30_000)
})
