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

export function IconForms() {
  return (
    <div className="flex h-[17px] w-3.5 flex-col justify-center gap-[2.5px] rounded-[2px] border-[1.5px] border-current px-[3px]">
      <div className="h-[5px] w-[5px] rounded-[1px] border-[1.5px] border-current" />
      <div className="h-[1.5px] w-[80%] bg-current" />
    </div>
  )
}

export function IconStudents() {
  return (
    <div className="relative h-4 w-4 rounded-full border-[1.5px] border-current">
      <div className="absolute left-[4px] top-[5px] h-[2px] w-[2px] rounded-full bg-current" />
      <div className="absolute right-[4px] top-[5px] h-[2px] w-[2px] rounded-full bg-current" />
      <div className="absolute bottom-[3px] left-1/2 h-[4px] w-[7px] -translate-x-1/2 rounded-b-full border-b-[1.5px] border-current" />
    </div>
  )
}

export function IconSettings() {
  return (
    <div className="flex h-[15px] w-[15px] items-center justify-center rounded-full border-[1.5px] border-current">
      <div className="h-[5px] w-[5px] rounded-full bg-current" />
    </div>
  )
}

export function IconFeedback() {
  return (
    <div className="relative h-4 w-4 rounded-[3px] rounded-bl-none border-[1.5px] border-current">
      <div className="absolute -bottom-[3px] left-[2px] h-[4px] w-[4px] rotate-45 border-b-[1.5px] border-l-[1.5px] border-current bg-rail" />
    </div>
  )
}
