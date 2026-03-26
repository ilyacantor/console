import { createContext, useContext, useState, type ReactNode } from 'react'

export type Mode = 'SE' | 'MA' | 'ME' | 'ALL'

const isDev = import.meta.env.DEV

interface ModeContextValue {
  mode: Mode
  setMode: (mode: Mode) => void
  isDev: boolean
}

const ModeContext = createContext<ModeContextValue | undefined>(undefined)

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(isDev ? 'ALL' : 'SE')

  return (
    <ModeContext.Provider value={{ mode, setMode, isDev }}>
      {children}
    </ModeContext.Provider>
  )
}

export function useMode() {
  const ctx = useContext(ModeContext)
  if (!ctx) {
    throw new Error('useMode must be used within ModeProvider')
  }
  return ctx
}
