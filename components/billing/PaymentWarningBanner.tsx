import Link from 'next/link'

// Copy is resolved by the caller: this renders inside the organizer server
// layout, which already knows the locale, and a props hand-off keeps the
// component synchronous (async-RSC-as-JSX breaks jsdom page tests).
export function PaymentWarningBanner({ body, cta }: { body: string; cta: string }) {
  return (
    <div className="bg-red-600 px-4 py-2 text-center text-sm text-white">
      {body}{' '}
      <Link href="/billing/portal" className="underline font-medium">{cta}</Link>
    </div>
  )
}
