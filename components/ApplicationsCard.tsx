'use client'
import { useState } from 'react'
import Link from 'next/link'
import { setApplicationOpen } from '@/actions/exchanges'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

interface Props {
  exchangeId: string
  applySlug: string
  open: boolean
  deadline: string | null
  counts: { submitted: number; toReview: number; accepted: number }
}

export function ApplicationsCard({ exchangeId, applySlug, open, deadline, counts }: Props) {
  const [isOpen, setIsOpen] = useState(open)
  const [dl, setDl] = useState(deadline ?? '')
  const [saving, setSaving] = useState(false)
  const appUrl = typeof window !== 'undefined' ? `${window.location.origin}/apply/${applySlug}` : `/apply/${applySlug}`

  async function toggle(next: boolean) {
    setSaving(true)
    try { await setApplicationOpen(exchangeId, next, dl || null); setIsOpen(next) } finally { setSaving(false) }
  }
  async function saveDeadline() {
    setSaving(true)
    try { await setApplicationOpen(exchangeId, isOpen, dl || null) } finally { setSaving(false) }
  }

  return (
    <Card className="p-5 mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">Phase 1 · Applications</h2>
        <Button size="sm" variant={isOpen ? 'secondary' : 'outline'} disabled={saving} onClick={() => toggle(!isOpen)}>
          {isOpen ? 'Open — click to close' : 'Closed — click to open'}
        </Button>
      </div>

      <label className="text-xs text-muted-foreground">Share this link in your intro email:</label>
      <div className="flex gap-2 mt-1 mb-3">
        <Input readOnly value={appUrl} onFocus={e => e.currentTarget.select()} />
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(appUrl)}>Copy</Button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs text-muted-foreground">Deadline:</label>
        <Input type="date" value={dl} onChange={e => setDl(e.target.value)} className="w-auto" />
        <Button size="sm" variant="ghost" disabled={saving} onClick={saveDeadline}>Save</Button>
      </div>

      {counts.toReview > 0 && (
        <p className="text-sm text-amber-700 mb-2">{counts.toReview} new application{counts.toReview === 1 ? '' : 's'} waiting for review.</p>
      )}
      <p className="text-sm text-muted-foreground mb-3">
        {counts.submitted} submitted · {counts.accepted} accepted
      </p>
      <Button asChild size="sm"><Link href={`/exchanges/${exchangeId}/applications`}>Review applications</Link></Button>
    </Card>
  )
}
