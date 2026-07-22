import { FileUserIcon, FilesIcon, MailIcon, SettingsIcon, UsersIcon } from 'lucide-react'

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

export function IconApplications() {
  return <FileUserIcon aria-hidden size={18} strokeWidth={1.75} />
}

export function IconForms() {
  return <FilesIcon aria-hidden size={18} strokeWidth={1.75} />
}

export function IconStudents() {
  return <UsersIcon aria-hidden size={18} strokeWidth={1.75} />
}

export function IconSettings() {
  return <SettingsIcon aria-hidden size={18} strokeWidth={1.75} />
}

export function IconFeedback() {
  return (
    <div className="relative h-4 w-4 rounded-[3px] rounded-bl-none border-[1.5px] border-current">
      <div className="absolute -bottom-[3px] left-[2px] h-[4px] w-[4px] rotate-45 border-b-[1.5px] border-l-[1.5px] border-current bg-rail" />
    </div>
  )
}

export function IconFeedbackLight() {
  return (
    <div className="relative h-4 w-4 rounded-[3px] rounded-bl-none border-[1.5px] border-current">
      <div className="absolute -bottom-[3px] left-[2px] h-[4px] w-[4px] rotate-45 border-b-[1.5px] border-l-[1.5px] border-current bg-card" />
    </div>
  )
}

export function IconCommunication() {
  return <MailIcon aria-hidden size={18} strokeWidth={1.75} />
}
