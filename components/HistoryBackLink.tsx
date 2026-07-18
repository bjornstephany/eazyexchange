'use client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

// History-back control for pages reachable from several origins (Documents
// drawer, Student detail) where no static back href exists.
export function HistoryBackLink({ label }: { label: string }) {
  const router = useRouter()
  return (
    <Button variant="ghost" size="sm" className="-ml-2 mb-4 text-muted-foreground" onClick={() => router.back()}>
      {label}
    </Button>
  )
}
