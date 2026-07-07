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
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {how.steps.map((st) => (
          <div key={st.n} className="border-t-2 border-[#2456E6] pt-[18px]">
            <p className="mb-3.5 font-mono text-[13px] font-semibold text-[#9AA6C0]">{st.n}</p>
            <h3 className="mb-2 font-display text-[18px] font-semibold text-[#10203F]">{st.title}</h3>
            <p className="text-[14px] leading-[1.55] text-[#5B6B8C]">{st.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 grid items-center gap-8 rounded-[16px] border border-[#E4E9F2] bg-[#F5F7FC] px-[30px] py-[28px] md:grid-cols-2">
        <div>
          <p className="mb-2.5 font-mono text-[12px] font-semibold uppercase tracking-[.12em] text-[#2456E6]">
            {how.reminder.eyebrow}
          </p>
          <p className="max-w-[420px] text-[15px] font-medium leading-[1.55] text-[#10203F]">
            {how.reminder.note}
          </p>
        </div>
        <div className="rounded-[12px] border border-[#E4E9F2] bg-white p-[18px] shadow-[0_10px_30px_-18px_rgba(16,32,63,.4)]">
          <div className="flex items-center gap-2.5 border-b border-[#EEF1F7] pb-3">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#2456E6] text-[12px] font-bold text-white" aria-hidden>
              E
            </span>
            <span className="font-display text-[14px] font-bold text-[#10203F]">{how.reminder.sender}</span>
          </div>
          <p className="mt-3 text-[14px] font-semibold text-[#10203F]">{how.reminder.subject}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {how.reminder.checklist.map((item) => (
              <li key={item} className="flex items-center gap-2 text-[13px] text-[#5B6B8C]">
                <span aria-hidden className="text-[14px] leading-none text-[#9AA6C0]">☐</span>
                {item}
              </li>
            ))}
          </ul>
          <span className="mt-4 inline-block rounded-full bg-[#EEF3FF] px-3 py-1 font-mono text-[11px] font-semibold text-[#2456E6]">
            {how.reminder.deadline}
          </span>
        </div>
      </div>
    </section>
  )
}
