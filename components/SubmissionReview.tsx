'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveSubmission, rejectSubmission } from '@/actions/submissions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export function SubmissionReview({ assignmentId, exchangeId }: { assignmentId: string; exchangeId: string }) {
  const [note, setNote] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleApprove() {
    setLoading('approve')
    setError(null)
    try {
      await approveSubmission(assignmentId)
      router.push(`/exchanges/${exchangeId}`)
    } catch (err: any) {
      setError(err.message ?? 'Failed to approve')
      setLoading(null)
    }
  }

  async function handleReject() {
    if (!note.trim()) return
    setLoading('reject')
    setError(null)
    try {
      await rejectSubmission(assignmentId, note.trim())
      router.push(`/exchanges/${exchangeId}`)
    } catch (err: any) {
      setError(err.message ?? 'Failed to reject')
      setLoading(null)
    }
  }

  return (
    <div className="border-t pt-6 mt-6">
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {!showReject ? (
        <div className="flex gap-3">
          <Button onClick={handleApprove} disabled={loading !== null}>
            {loading === 'approve' ? 'Approving…' : 'Approve'}
          </Button>
          <Button variant="outline" onClick={() => setShowReject(true)} disabled={loading !== null}>
            Reject
          </Button>
        </div>
      ) : (
        <div className="space-y-3 max-w-md">
          <div className="space-y-1">
            <Label htmlFor="note">Rejection note (required)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Explain what needs to be changed…"
              rows={3}
            />
          </div>
          <div className="flex gap-3">
            <Button variant="destructive" onClick={handleReject} disabled={!note.trim() || loading !== null}>
              {loading === 'reject' ? 'Rejecting…' : 'Confirm reject'}
            </Button>
            <Button variant="ghost" onClick={() => setShowReject(false)} disabled={loading !== null}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
