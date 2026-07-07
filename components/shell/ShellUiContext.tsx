'use client'
import { createContext, useContext } from 'react'

export type ShellUi = {
  openNewExchange: () => void
  // Contextual top-bar search (set by the shell on /students, consumed by the
  // students list view as a client-side filter).
  listSearch: string
  setListSearch: (q: string) => void
}

export const ShellUiContext = createContext<ShellUi>({
  openNewExchange: () => {},
  listSearch: '',
  setListSearch: () => {},
})

export const useShellUi = () => useContext(ShellUiContext)
