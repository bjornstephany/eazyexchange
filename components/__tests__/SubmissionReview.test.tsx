import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const back = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ back, push: vi.fn(), refresh: vi.fn() }) }))
const approveSubmission = vi.fn().mockResolvedValue(undefined)
const rejectSubmission = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/submissions', () => ({
  approveSubmission: (...a: unknown[]) => approveSubmission(...a),
  rejectSubmission: (...a: unknown[]) => rejectSubmission(...a),
}))

import { SubmissionReview } from '@/components/SubmissionReview'

describe('SubmissionReview', () => {
  beforeEach(() => { back.mockClear(); approveSubmission.mockClear(); rejectSubmission.mockClear() })

  it('approve returns via history-back', async () => {
    render(<SubmissionReview assignmentId="a1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(back).toHaveBeenCalled())
    expect(approveSubmission).toHaveBeenCalledWith('a1')
  })

  it('confirmed reject returns via history-back', async () => {
    render(<SubmissionReview assignmentId="a1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.change(screen.getByLabelText('Rejection note (required)'), { target: { value: 'Fix it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reject' }))
    await waitFor(() => expect(back).toHaveBeenCalled())
    expect(rejectSubmission).toHaveBeenCalledWith('a1', 'Fix it')
  })
})
