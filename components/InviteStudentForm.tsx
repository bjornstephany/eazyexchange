'use client'
import { useState } from 'react'
import { inviteStudent } from '@/actions/students'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function InviteStudentForm({ exchangeId }: { exchangeId: string }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      await inviteStudent(exchangeId, email.trim().toLowerCase())
      setSuccess(`Invite sent to ${email}`)
      setEmail('')
    } catch (err: any) {
      setError(err.message ?? 'Failed to send invite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 sm:items-end">
      <div className="flex-1 space-y-1">
        <Label htmlFor="email">Student email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="student@school.edu"
          required
        />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? 'Sending…' : 'Send invite'}
      </Button>
      {error && <p className="text-sm text-red-600 self-end">{error}</p>}
      {success && <p className="text-sm text-green-600 self-end">{success}</p>}
    </form>
  )
}
