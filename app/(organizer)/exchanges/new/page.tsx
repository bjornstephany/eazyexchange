import { redirect } from 'next/navigation'

export default function NewExchangePage() {
  redirect('/dashboard?new-exchange=1')
}
