import Link from 'next/link'
import { Logo } from '@/components/brand/Logo'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-[#E4E9F2]">
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-6 py-4">
          <Logo href="/" />
          <Link href="/" className="text-sm font-medium text-[#5B6B8C] hover:text-[#10203F]">
            Retour à l’accueil
          </Link>
        </div>
      </header>
      {children}
    </div>
  )
}
