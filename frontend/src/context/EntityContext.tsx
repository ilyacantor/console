import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useMode } from './ModeContext'
import { ENTITIES_BY_MODE, type EntityOption } from '../data/entityData'

interface EntityContextValue {
  options: EntityOption[]
  selected: string | null
  setSelected: (id: string | null) => void
}

const EntityContext = createContext<EntityContextValue | undefined>(undefined)

export function EntityProvider({ children }: { children: ReactNode }) {
  const { mode } = useMode()
  const options = ENTITIES_BY_MODE[mode]
  const [selected, setSelected] = useState<string | null>(options[0]?.id ?? null)

  useEffect(() => {
    setSelected(options[0]?.id ?? null)
  }, [mode])

  return (
    <EntityContext.Provider value={{ options, selected, setSelected }}>
      {children}
    </EntityContext.Provider>
  )
}

export function useEntity() {
  const ctx = useContext(EntityContext)
  if (!ctx) {
    throw new Error('useEntity must be used within EntityProvider')
  }
  return ctx
}
