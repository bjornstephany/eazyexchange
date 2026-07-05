'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'

export async function setActiveExchange(exchangeId: string) {
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_EXCHANGE_COOKIE, exchangeId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })
  // Every organizer page + the shell derives from the active exchange.
  revalidatePath('/', 'layout')
}
