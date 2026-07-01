'use client'
import { createExchange } from '@/actions/exchanges'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useState } from 'react'

export function NewExchangeForm({ needsSchoolName }: { needsSchoolName: boolean }) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await createExchange(new FormData(e.currentTarget))
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader><CardTitle>New exchange</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Exchange name</Label>
            <Input id="name" name="name" placeholder="France–Canada 2026" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="year">Year</Label>
            <Input id="year" name="year" type="number" defaultValue={new Date().getFullYear()} required />
          </div>
          {needsSchoolName && (
            <div className="space-y-1">
              <Label htmlFor="school_a_name">Your school name</Label>
              <Input id="school_a_name" name="school_a_name" placeholder="Lincoln High" required />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="school_b_name">Partner school name</Label>
            <Input id="school_b_name" name="school_b_name" placeholder="Lycée Victor Hugo" required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create exchange'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
