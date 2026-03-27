import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { fetchEngagements, type Engagement } from '../api/client'

const STORAGE_KEY = 'aos-console-active-engagement-id'

interface EngagementContextValue {
  engagements: Engagement[]
  activeEngagement: Engagement | null
  setActiveEngagement: (engagement: Engagement) => void
  loading: boolean
  error: string | null
  refresh: () => void
}

const EngagementContext = createContext<EngagementContextValue | undefined>(undefined)

function pickDefault(list: Engagement[]): Engagement | null {
  if (list.length === 0) return null
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    const match = list.find((e) => e.engagement_id === stored)
    if (match) return match
  }
  const ma = list.find((e) => e.engagement_type === 'MA')
  return ma ?? list[0]!
}

export function EngagementProvider({ children }: { children: ReactNode }) {
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [activeEngagement, setActiveState] = useState<Engagement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchEngagements()
      .then(({ engagements: list }) => {
        setEngagements(list)
        setActiveState((prev) => {
          if (prev) {
            const still = list.find((e) => e.engagement_id === prev.engagement_id)
            if (still) return still
          }
          return pickDefault(list)
        })
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load engagements')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const setActiveEngagement = useCallback((engagement: Engagement) => {
    setActiveState(engagement)
    localStorage.setItem(STORAGE_KEY, engagement.engagement_id)
  }, [])

  return (
    <EngagementContext.Provider
      value={{ engagements, activeEngagement, setActiveEngagement, loading, error, refresh: load }}
    >
      {children}
    </EngagementContext.Provider>
  )
}

export function useEngagement() {
  const ctx = useContext(EngagementContext)
  if (!ctx) {
    throw new Error('useEngagement must be used within EngagementProvider')
  }
  return ctx
}
