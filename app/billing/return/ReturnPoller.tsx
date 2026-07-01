'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// The webhook may lag the redirect by a second. Refresh the server component
// until it sees `active` and redirects to the dashboard.
export function ReturnPoller() {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 2000)
    return () => clearInterval(t)
  }, [router])
  return null
}
