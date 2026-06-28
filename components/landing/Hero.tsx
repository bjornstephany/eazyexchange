import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { landingContent } from '@/lib/landing/content'

export function Hero() {
  const { headline, subhead, primaryCta, secondaryCta } = landingContent.hero
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 text-center">
      <h1 className="mx-auto max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
        {headline}
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
        {subhead}
      </p>
      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href={primaryCta.href}>{primaryCta.label}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href={secondaryCta.href}>{secondaryCta.label}</Link>
        </Button>
      </div>
    </section>
  )
}
