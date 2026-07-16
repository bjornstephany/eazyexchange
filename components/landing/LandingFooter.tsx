import Link from 'next/link'
import { Logo } from './Logo'
import type { LandingContent } from '@/lib/landing/content'

export function LandingFooter({ footer }: { footer: LandingContent['footer'] }) {
  return (
    <footer className="bg-[#0E1B38]">
      <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-[18px] border-t border-white/10 px-6 pb-[34px] pt-[26px]">
        <span className="flex items-center gap-2.5">
          <Logo size="footer" variant="inverse" />
          <span className="font-display text-[16px] font-bold tracking-[-.02em] text-white">Eazyexchange</span>
        </span>
        <span className="flex flex-wrap gap-[22px]">
          <a href="#produit" className="text-[13px] font-medium text-[#8595B8] hover:text-white">
            {footer.product}
          </a>
          <Link href="/login" className="text-[13px] font-medium text-[#8595B8] hover:text-white">
            {footer.login}
          </Link>
        </span>
        <span className="font-mono text-[12px] text-[#5B6B8C]">{footer.copyright}</span>
      </div>
    </footer>
  )
}
