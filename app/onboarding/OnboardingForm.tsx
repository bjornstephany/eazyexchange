'use client'
import { useState } from 'react'
import { completeOnboarding } from '@/actions/onboarding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function OnboardingForm() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await completeOnboarding(new FormData(e.currentTarget))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name" className="text-[13px] font-semibold text-[#42506E]">Votre établissement</Label>
        <Input id="name" name="name" required className="h-11 rounded-[10px] border-[#C4CDE0]" />
      </div>
      {error && <p className="text-sm text-[#C0392B]">{error}</p>}
      <Button type="submit" disabled={loading} className="h-11 w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">
        {loading ? 'Enregistrement…' : 'Continuer'}
      </Button>
    </form>
  )
}
