import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { DataPrivacyCard } from '../DataPrivacyCard'

const eraseSubject = vi.fn(async (_ref: unknown) => ({ ok: true }))
vi.mock('@/actions/retention', () => ({ eraseSubject: (ref: unknown) => eraseSubject(ref) }))

const messages = { organizer: { dataPrivacy: {
  heading: 'Données', subtitle: 's', students: 'Élèves', applicants: 'Candidats',
  empty: 'Aucune', delete: 'Supprimer', deleting: '…',
  confirmTitle: 'Supprimer ?', confirmBody: 'Irréversible {name}',
  confirmCancel: 'Annuler', confirmConfirm: 'Supprimer définitivement',
  deleteError: 'échec', deleted: 'ok',
} } }

function renderCard(subjects: any[]) {
  return render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <DataPrivacyCard subjects={subjects} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('DataPrivacyCard', () => {
  it('lists subjects and erases after confirmation', async () => {
    renderCard([{ kind: 'student', id: 'stu-1', name: 'Alice', email: 'a@x', status: null }])
    expect(screen.getByText('Alice')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    // Confirmation required before the action fires.
    expect(eraseSubject).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement' }))
    await waitFor(() => expect(eraseSubject).toHaveBeenCalledWith({ kind: 'student', id: 'stu-1' }))
  })
})
