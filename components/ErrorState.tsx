'use client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

// Friendly French message for the auth errors thrown by our server actions;
// falls back to a generic line for anything unexpected. Vouvoiement is used even
// on the student boundary — these are generic system errors (approved).
function friendlyMessage(message: string): string {
  switch (message) {
    case 'Unauthorized':
      return "Vous n’avez pas accès à cette page."
    case 'Unauthenticated':
      return "Votre session a expiré. Reconnectez-vous."
    case 'Exchange not found':
    case 'Assignment not found':
      return "Nous n’avons pas trouvé ce que vous cherchiez."
    default:
      return "Une erreur est survenue de notre côté — vos données sont en sécurité. Réessayez, ou revenez en lieu sûr."
  }
}

export function ErrorState({
  error, reset, home,
}: { error: Error; reset: () => void; home: { href: string; label: string } }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <div className="flex items-center">
        <span className="h-12 w-12 flex-none rounded-full bg-navy" />
        <span className="w-24 border-t-[3px] border-dashed border-[#AEB7CB]" />
        <span className="h-12 w-12 flex-none rounded-full bg-brand" />
      </div>
      <h3 className="font-display text-[36px] font-bold text-navy">Le fil s’est rompu.</h3>
      <p className="max-w-[520px] text-[18px] leading-relaxed text-muted-foreground">
        {friendlyMessage(error.message)}
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={reset}>Réessayer</Button>
        <Button asChild variant="outline">
          <Link href={home.href}>{home.label}</Link>
        </Button>
      </div>
    </div>
  )
}
