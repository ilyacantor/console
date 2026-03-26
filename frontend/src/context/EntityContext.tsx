import { createContext, useContext, useState, type ReactNode } from 'react'

export interface Entity {
  id: string
  label: string
}

const ENTITIES: Entity[] = [
  { id: 'meridian', label: 'Meridian' },
  { id: 'cascadia', label: 'Cascadia' },
  { id: 'techflow', label: 'TechFlow' },
]

interface EntityContextValue {
  entities: Entity[]
  selected: string | null  // null = "All entities"
  setSelected: (id: string | null) => void
}

const EntityContext = createContext<EntityContextValue | undefined>(undefined)

export function EntityProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <EntityContext.Provider value={{ entities: ENTITIES, selected, setSelected }}>
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
