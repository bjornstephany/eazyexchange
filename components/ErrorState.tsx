'use client'
import { Button } from '@/components/ui/button'

// Friendly message for the auth errors thrown by our server actions; falls back
// to a generic line for anything unexpected.
function friendlyMessage(message: string): string {
  switch (message) {
    case 'Unauthorized':
      return "You don't have access to this."
    case 'Unauthenticated':
      return 'Your session expired. Please sign in again.'
    case 'Exchange not found':
    case 'Assignment not found':
      return "We couldn't find what you were looking for."
    default:
      return 'Something went wrong while loading this page.'
  }
}

export function ErrorState({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-foreground font-medium mb-1">{friendlyMessage(error.message)}</p>
      <p className="text-sm text-muted-foreground mb-6">Try again, or head back and retry.</p>
      <Button onClick={reset} variant="outline" size="sm">Try again</Button>
    </div>
  )
}
