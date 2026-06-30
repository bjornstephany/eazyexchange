'use client'
import { useState } from 'react'
import { respondToInvitation } from '@/actions/applications'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function InviteResponseForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [result, setResult] = useState<'yes' | 'no' | 'maybe' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function respond(response: 'yes' | 'no' | 'maybe') {
    setBusy(true); setError(null)
    try { await respondToInvitation(token, response, response === 'maybe' ? note : ''); setResult(response) }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); setBusy(false) }
  }

  if (result === 'yes') return <p className="text-emerald-700">Wonderful! Check your email for a link to set up your account and get started.</p>
  if (result === 'no') return <p className="text-slate-700">Thanks for letting us know. We wish you all the best.</p>
  if (result === 'maybe') return <p className="text-slate-700">Thanks &mdash; we&apos;ve noted your response and the organizer will follow up.</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <Button disabled={busy} onClick={() => respond('yes')}>Yes, I&apos;d like to join</Button>
        <Button variant="outline" disabled={busy} onClick={() => respond('no')}>No, thank you</Button>
      </div>
      <div className="space-y-2">
        <Textarea placeholder="If you're unsure, add a note (optional)" value={note} onChange={e => setNote(e.target.value)} />
        <Button variant="ghost" disabled={busy} onClick={() => respond('maybe')}>Maybe &mdash; I need more time</Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
