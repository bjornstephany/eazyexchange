// Navy info banner under the stats strip (automation promise line).
export function PageBanner({ text }: { text: string }) {
  return (
    <div className="mb-[26px] flex items-center gap-3 rounded-xl bg-rail px-[18px] py-3.5">
      <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg bg-white/10 text-[15px] text-white">✉</div>
      <span className="text-[12.5px] leading-[1.45] text-white/75">{text}</span>
    </div>
  )
}
