import type { LandingContent } from '@/lib/landing/content'

export function HowItWorks({ how }: { how: LandingContent['how'] }) {
  return (
    <section className="mx-auto max-w-[1180px] px-6 pb-20 sm:px-10">
      <p className="mb-4 font-mono text-[12px] font-semibold uppercase tracking-[.14em] text-[#2456E6]">
        {how.eyebrow}
      </p>
      <h2 className="mb-10 max-w-[640px] font-display text-[34px] font-bold leading-[1.1] tracking-[-.02em] text-[#10203F]">
        {how.title}
      </h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {how.steps.map((st) => (
          <div key={st.n} className="border-t-2 border-[#2456E6] pt-[18px]">
            <p className="mb-3.5 font-mono text-[13px] font-semibold text-[#9AA6C0]">{st.n}</p>
            <h3 className="mb-2 font-display text-[18px] font-semibold text-[#10203F]">{st.title}</h3>
            <p className="text-[14px] leading-[1.55] text-[#5B6B8C]">{st.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 flex items-center gap-4 rounded-[14px] border border-[#E4E9F2] bg-[#F5F7FC] px-[26px] py-[22px]">
        <span
          className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-[#2456E6] text-[18px] font-semibold text-white"
          aria-hidden
        >
          &#8635;
        </span>
        <p className="max-w-[820px] text-[15px] font-medium leading-[1.5] text-[#10203F]">{how.note}</p>
      </div>
    </section>
  )
}
