import Link from 'next/link'
import { landingContent } from '@/lib/landing/content'

export function LandingFooter() {
  const { brand, tagline, links, copyright } = landingContent.footer
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">{brand}</p>
          <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>
        </div>
        <nav className="flex gap-4 text-sm">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-muted-foreground hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="pb-8 text-center text-xs text-muted-foreground">{copyright}</p>
    </footer>
  )
}
