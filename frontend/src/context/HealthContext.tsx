import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { fetchHealth, type HealthResponse, type ServiceHealth } from '../api/client'

interface HealthContextValue {
  health: HealthResponse | null
  getServiceStatus: (name: string) => ServiceHealth | null
}

const HealthContext = createContext<HealthContextValue | undefined>(undefined)

export function HealthProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await fetchHealth()
        if (!cancelled) setHealth(data)
      } catch {
        // Health fetch failed — don't crash the app
      }
    }
    load()
    const interval = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const getServiceStatus = useCallback(
    (name: string): ServiceHealth | null => {
      if (!health) return null
      return health.services.find((s) => s.name === name) ?? null
    },
    [health],
  )

  return (
    <HealthContext.Provider value={{ health, getServiceStatus }}>
      {children}
    </HealthContext.Provider>
  )
}

export function useHealth() {
  const ctx = useContext(HealthContext)
  if (!ctx) {
    throw new Error('useHealth must be used within HealthProvider')
  }
  return ctx
}
