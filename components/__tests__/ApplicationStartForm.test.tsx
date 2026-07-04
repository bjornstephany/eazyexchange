import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/actions/applications', () => ({ startApplication: vi.fn(async () => ({ token: 'tok' })) }))

import { ApplicationStartForm } from '@/components/ApplicationStartForm'

describe('ApplicationStartForm', () => {
  it('starts in EN and switches the CTA to French', async () => {
    const user = userEvent.setup()
    render(<ApplicationStartForm slug="france-canada" />)
    expect(screen.getByRole('button', { name: /start my application/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'FR' }))
    expect(screen.getByRole('button', { name: /commencer ma candidature/i })).toBeInTheDocument()
  })
})
