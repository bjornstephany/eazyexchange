'use client'
import { createContext, useContext } from 'react'

export type ShellUi = {
  openNewExchange: () => void
  // Contextual top-bar search (set by the shell on /forms and /documents,
  // consumed by the list views as a client-side filter).
  listSearch: string
  setListSearch: (q: string) => void
  // The top-bar page CTA bumps this counter; list views open their add panel
  // when it changes.
  addRequestId: number
  requestAdd: () => void
}

export const ShellUiContext = createContext<ShellUi>({
  openNewExchange: () => {},
  listSearch: '',
  setListSearch: () => {},
  addRequestId: 0,
  requestAdd: () => {},
})

export const useShellUi = () => useContext(ShellUiContext)
