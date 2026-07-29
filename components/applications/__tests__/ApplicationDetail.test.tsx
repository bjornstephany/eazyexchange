import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next-intl/server', async () =>
  (await import('@/lib/test/serverTranslations')).serverTranslationsMock)

// ApplicationReadView is an async Server Component (its own tests cover its
// rendering/label rules in components/__tests__/ApplicationReadView.test.tsx).
// Stubbed here so this file can isolate ApplicationDetail's ONE job that has
// no other test coverage: computing the `sections` prop from the raw
// `applicationFields` value and handing it through.
const applicationReadView = vi.fn((_props: unknown) => null)
vi.mock('@/components/ApplicationReadView', () => ({
  ApplicationReadView: (props: unknown) => applicationReadView(props),
}))
// Both 'use client' components read next-intl's CLIENT context, which this
// file does not set up — stub them out rather than stand up a provider for
// components whose own behavior is irrelevant to the prop under test.
vi.mock('@/components/ApplicationReviewActions', () => ({ ApplicationReviewActions: () => null }))
vi.mock('@/components/applications/PrintButton', () => ({ PrintButton: () => null }))

import { ApplicationDetail } from '@/components/applications/ApplicationDetail'
import { APPLICATION_SECTIONS } from '@/lib/application-form'
import { resolveApplicationSections, parseApplicationFields } from '@/lib/application-fields'

const application = {
  id: 'app-1', exchange_id: 'ex-1', status: 'submitted', email: 'a@b.fr',
  data: { first_name: 'Léa' }, invite_response: null, invite_response_note: null, review_note: null,
}

const baseProps = { application, photoUrl: null, exchangeName: 'Espagne', year: 2026 }

// Pins the one-line wiring at components/applications/ApplicationDetail.tsx:
// `sections={resolveApplicationSections(parseApplicationFields(applicationFields))}`.
// Neither half of the resolver chain has any other caller-side test — the
// review action returns `applicationFields` as an opaque `unknown` (pinned in
// actions/__tests__/application-detail-columns.test.ts), and
// resolveApplicationSections/parseApplicationFields are unit-tested in
// isolation (lib/__tests__/application-fields.test.ts) — but nothing
// previously asserted that THIS component actually chains them together.
describe('ApplicationDetail', () => {
  it.each([
    ['a null questionnaire (never customized)', null],
    ['a malformed questionnaire (must degrade, never throw)', { bogus: true }],
  ])('resolves to the built-in catalog for %s', async (_label, applicationFields) => {
    render(await ApplicationDetail({ ...baseProps, applicationFields }))
    expect(applicationReadView).toHaveBeenCalledWith(
      expect.objectContaining({ sections: APPLICATION_SECTIONS }),
    )
  })

  it("resolves to the exchange's own questionnaire when customized", async () => {
    const doc = {
      version: 1,
      sections: [
        { id: 'student', fields: [{ id: 'c_1', type: 'text', label: 'Allergies' }] },
        { id: 'parents', fields: [] },
        { id: 'hosting', fields: [] },
        { id: 'profile', fields: [] },
      ],
    }
    render(await ApplicationDetail({ ...baseProps, applicationFields: doc }))
    const expected = resolveApplicationSections(parseApplicationFields(doc))
    expect(applicationReadView).toHaveBeenCalledWith(expect.objectContaining({ sections: expected }))
    // Sanity: the customized questionnaire really does differ from the
    // default, so the assertion above could not pass by accident.
    expect(expected).not.toEqual(APPLICATION_SECTIONS)
  })
})
