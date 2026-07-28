'use client'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { asAppTranslator, type AppTranslator } from '@/lib/i18n/messages'

// Friendly message for the auth errors thrown by our server actions; falls back
// to a generic line for anything unexpected. Vouvoiement is used even on the
// student boundary — these are generic system errors (approved).
// The switch matches the RAW thrown strings ('Unauthorized' / 'Unauthenticated'
// are load-bearing across the codebase) — only the output is translated.
function friendlyMessage(message: string, c: AppTranslator): string {
  switch (message) {
    case 'Unauthorized':
      return c('errors.unauthorized')
    case 'Unauthenticated':
      return c('errors.sessionExpired')
    case 'Exchange not found':
    case 'Assignment not found':
      return c('errors.notFound')
    default:
      return c('errors.crash')
  }
}

export function ErrorState({
  error, reset, home,
}: { error: Error; reset: () => void; home: { href: string; label: string } }) {
  const c = asAppTranslator(useTranslations('common'))
  return (
    <div
      data-testid="error-state"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-6 bg-background px-4 text-center"
    >
      <div className="flex items-center">
        <span className="h-12 w-12 flex-none rounded-full bg-navy" />
        <span className="w-24 border-t-[3px] border-dashed border-[#AEB7CB]" />
        <span className="h-12 w-12 flex-none rounded-full bg-brand" />
      </div>
      <h3 className="font-display text-[36px] font-bold text-navy">{c('errors.heading')}</h3>
      <p className="max-w-[520px] text-[18px] leading-relaxed text-muted-foreground">
        {friendlyMessage(error.message, c)}
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={reset}>{c('actions.retry')}</Button>
        <Button asChild variant="outline">
          <Link href={home.href}>{home.label}</Link>
        </Button>
      </div>
    </div>
  )
}
