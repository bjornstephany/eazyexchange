'use client'
import { createContext, useContext } from 'react'

export type ShellUi = {
  openNewExchange: () => void
}

export const ShellUiContext = createContext<ShellUi>({
  openNewExchange: () => {},
})

export const useShellUi = () => useContext(ShellUiContext)
