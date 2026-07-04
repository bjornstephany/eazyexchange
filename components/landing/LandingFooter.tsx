import { Logo } from './Logo'
import type { LandingContent } from '@/lib/landing/content'

export function LandingFooter({ footerTag }: { footerTag: LandingContent['footerTag'] }) {
  return (
    <footer className="mx-auto flex max-w-[1180px] flex-col items-center gap-3 px-6 py-7 text-center sm:flex-row sm:justify-between sm:px-10 sm:text-left">
      <div className="flex items-center gap-2.5">
        <Logo size="footer" />
        <span className="font-display text-[14px] font-semibold text-[#10203F]">Eazyexchange</span>
      </div>
      <span className="text-[13px] text-[#8A97B2]">{footerTag}</span>
    </footer>
  )
}
