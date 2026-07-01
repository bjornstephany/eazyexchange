import Link from 'next/link'

export function PaymentWarningBanner() {
  return (
    <div className="bg-red-600 px-4 py-2 text-center text-sm text-white">
      Your last payment failed — update your card to keep your plan.{' '}
      <Link href="/billing/portal" className="underline font-medium">Update payment</Link>
    </div>
  )
}
