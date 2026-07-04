import type { LandingContent } from '@/lib/landing/content'

export function Features({ features }: { features: LandingContent['features'] }) {
  return (
    <section id="features" className="mx-auto max-w-[1180px] scroll-mt-20 px-6 pb-[72px] pt-6 sm:px-10">
      <p className="mb-4 font-mono text-[12px] font-semibold uppercase tracking-[.14em] text-[#2456E6]">
        {features.eyebrow}
      </p>
      <h2 className="mb-11 max-w-[640px] font-display text-[34px] font-bold leading-[1.1] tracking-[-.02em] text-[#10203F]">
        {features.title}
      </h2>
      <div className="grid gap-6 sm:grid-cols-3">
        {features.pillars.map((p, i) => (
          <div key={p.title} className="rounded-[14px] border border-[#E4E9F2] bg-[#FBFCFE] p-[30px]">
            <p className="mb-[18px] font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-[#2456E6]">
              {String(i + 1).padStart(2, '0')} · {p.tag}
            </p>
            <h3 className="mb-2.5 font-display text-[21px] font-semibold text-[#10203F]">{p.title}</h3>
            <p className="text-[15px] leading-[1.6] text-[#5B6B8C]">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
