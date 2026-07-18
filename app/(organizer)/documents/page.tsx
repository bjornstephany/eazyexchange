import { redirect } from 'next/navigation'

// The Docs tab merged into « Fichiers » (/forms) — 2026-07-18 spec.
export default function DocumentsPage() {
  redirect('/forms')
}
