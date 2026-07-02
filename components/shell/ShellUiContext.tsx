'use client'
import { createContext, useContext } from 'react'

export const ShellUiContext = createContext<{ openNewExchange: () => void }>({
  openNewExchange: () => {},
})

export const useShellUi = () => useContext(ShellUiContext)
