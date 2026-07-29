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

export function IconBell() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width={18}
      height={18}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.25 9a6.75 6.75 0 0 1 13.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 0 1-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 1 1-7.48 0 24.585 24.585 0 0 1-4.831-1.244.75.75 0 0 1-.298-1.205A8.217 8.217 0 0 0 5.25 9.75V9Zm4.502 8.9a2.25 2.25 0 1 0 4.496 0 25.057 25.057 0 0 1-4.496 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
}
