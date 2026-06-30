import Link from 'next/link'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { landingContent } from '@/lib/landing/content'

export function Pricing() {
  const { title, subtitle, popularLabel, valueProp, tiers, note } = landingContent.pricing
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-3 text-muted-foreground">{subtitle}</p>
      </div>
      <div className="mx-auto mt-10 max-w-3xl rounded-xl border bg-muted/40 p-6 text-center">
        <p className="text-lg font-semibold">{valueProp.headline}</p>
        <p className="mt-2 text-sm text-muted-foreground">{valueProp.body}</p>
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {tiers.map((tier) => (
          <Card key={tier.name} className={tier.highlighted ? 'border-primary shadow-md' : undefined}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{tier.name}</CardTitle>
                {tier.highlighted && <Badge>{popularLabel}</Badge>}
              </div>
              <p className="mt-2">
                <span className="text-3xl font-bold">{tier.price}</span>{' '}
                <span className="text-muted-foreground">{tier.period}</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{tier.description}</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button asChild className="w-full" variant={tier.highlighted ? 'default' : 'outline'}>
                <Link href={tier.cta.href}>{tier.cta.label}</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">{note}</p>
    </section>
  )
}
