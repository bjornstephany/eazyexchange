'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/my-forms', label: 'Mon dossier' },
  { href: '/infos', label: 'Infos' },
]

export function StudentTabs() {
  const pathname = usePathname()
  return (
    <nav className="sticky top-[66px] z-10 flex gap-1 border-b bg-card px-7">
      {TABS.map(tab => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/')
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px border-b-2 px-3 py-3 text-[13.5px] font-semibold ${
              active ? 'border-brand text-navy' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
