import { redirect } from 'next/navigation'

// Phase 3: form creation moved to the session-scoped /forms page.
export default function LegacyNewFormPage() {
  redirect('/forms')
}
