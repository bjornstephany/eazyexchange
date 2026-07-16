import Link from 'next/link'
import type { LandingContent } from '@/lib/landing/content'

export function Hero({ hero }: { hero: LandingContent['hero'] }) {
  return (
    <section className="mx-auto max-w-[1160px] px-6 pt-[54px]">
      <div className="max-w-[760px]">
        <p className="mb-[18px] font-mono text-[12px] font-semibold uppercase tracking-[.14em] text-[#2456E6]">
          {hero.eyebrow}
        </p>
        <h1 className="mb-[18px] text-balance font-display text-[length:clamp(36px,5.2vw,60px)] font-extrabold leading-[1.04] tracking-[-.028em] text-[#10203F]">
          {hero.title}
        </h1>
        <p className="mb-[30px] max-w-[600px] text-[length:clamp(16px,1.6vw,19px)] leading-[1.55] text-[#5B6B8C]">
          {hero.sub}
        </p>
        <Link
          href="/signup"
          className="inline-flex items-center rounded-[11px] bg-[#2456E6] px-7 py-4 text-[16.5px] font-semibold text-white shadow-[0_14px_30px_-14px_rgba(36,86,230,.55)] transition hover:bg-[#1D48C7]"
        >
          {hero.ctaPrimary}
        </Link>
        <p className="mt-4 font-mono text-[12px] font-medium text-[#8A97B2]">{hero.note}</p>
      </div>
    </section>
  )
}
