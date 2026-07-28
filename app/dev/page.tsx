import { notFound } from 'next/navigation'
import { isDevQuickAccessEnabled, readSeedManifest, type SeedAccount } from '@/lib/dev/local-only'
import { devSignIn } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Accès rapide (local)', robots: { index: false, follow: false } }

function AccountButton({ account }: { account: SeedAccount }) {
  const signIn = devSignIn.bind(null, account.email)
  return (
    <form action={signIn}>
      <button
        type="submit"
        className="flex w-full items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-400 hover:bg-slate-50"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium text-slate-900">{account.name}</span>
          <span className="block truncate text-sm text-slate-500">{account.email}</span>
        </span>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
          {account.note}
        </span>
      </button>
    </form>
  )
}

export default async function DevPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (!isDevQuickAccessEnabled()) notFound()

  const { error } = await searchParams
  const manifest = readSeedManifest()
  if (!manifest) {
    return (
      <main className="mx-auto max-w-2xl p-10">
        <h1 className="font-display text-2xl font-bold text-slate-900">Accès rapide</h1>
        <p className="mt-4 text-slate-600">
          Aucun jeu de données trouvé. Lancez{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">pnpm seed</code> puis rechargez cette
          page.
        </p>
      </main>
    )
  }

  const organizers = manifest.accounts.filter((a) => a.role === 'organizer')
  const students = manifest.accounts.filter((a) => a.role === 'student' && !a.smoke)
  const reserved = manifest.accounts.filter((a) => a.role === 'student' && a.smoke)
  const highlighted = students.filter((s) => s.highlight)
  const rest = students.filter((s) => !s.highlight)

  return (
    <main className="mx-auto max-w-2xl p-10">
      <h1 className="font-display text-2xl font-bold text-slate-900">Accès rapide</h1>
      <p className="mt-1 text-sm text-slate-500">
        {manifest.school} · {manifest.exchange} · {students.length} élèves · local uniquement
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Organisateurs
      </h2>
      <div className="mt-3 flex flex-col gap-2">
        {organizers.map((a) => (
          <AccountButton key={a.email} account={a} />
        ))}
      </div>

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Élèves — cas courants
      </h2>
      <div className="mt-3 flex flex-col gap-2">
        {highlighted.map((a) => (
          <AccountButton key={a.email} account={a} />
        ))}
      </div>

      <details className="mt-6">
        <summary className="cursor-pointer text-sm text-slate-600">
          Tous les élèves ({students.length})
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          {rest.map((a) => (
            <AccountButton key={a.email} account={a} />
          ))}
        </div>
      </details>

      {reserved.length > 0 && (
        <div className="mt-6 opacity-50">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Réservés aux tests automatisés
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Le dossier de ces comptes est réécrit à chaque <code>pnpm ship</code>. Ne cliquez pas
            ici pour explorer l’application.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {reserved.map((a) => (
              <AccountButton key={a.email} account={a} />
            ))}
          </div>
        </div>
      )}

      <p className="mt-10 text-sm text-slate-500">
        <a className="underline" href="http://127.0.0.1:54324" target="_blank" rel="noreferrer">
          Boîte mail locale
        </a>
        {' · '}
        <a className="underline" href="http://127.0.0.1:54323" target="_blank" rel="noreferrer">
          Supabase Studio
        </a>
        {' · '}
        <span>
          Remettre à zéro :{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">pnpm dev --reseed</code>
        </span>
      </p>
      <p className="mt-2 text-xs text-slate-400">
        Pour être organisateur et élève en même temps, utilisez deux profils de navigateur.
      </p>
    </main>
  )
}
