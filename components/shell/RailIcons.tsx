export function IconOverview() {
  return (
    <div className="grid grid-cols-[6px_6px] grid-rows-[6px_6px] gap-[3px]">
      <div className="rounded-[1.5px] bg-current" />
      <div className="rounded-[1.5px] bg-current" />
      <div className="rounded-[1.5px] bg-current" />
      <div className="rounded-[1.5px] bg-current" />
    </div>
  )
}

export function IconExchanges() {
  return (
    <div className="relative h-3 w-5">
      <div className="absolute left-0 top-0 h-3 w-3 rounded-full border-[1.5px] border-current" />
      <div className="absolute right-0 top-0 h-3 w-3 rounded-full border-[1.5px] border-current bg-rail" />
    </div>
  )
}

export function IconApplications() {
  return (
    <div className="flex h-[17px] w-[14px] flex-col justify-center gap-[2px] rounded-[2px] border-[1.5px] border-current px-[3px]">
      <div className="h-[1.5px] bg-current" />
      <div className="h-[1.5px] w-[70%] bg-current" />
    </div>
  )
}
