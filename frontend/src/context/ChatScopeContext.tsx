import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * ChatScopeContext — pages declare what's relevant to the chat envelope.
 *
 * The default scope is null. Pages that ARE engagement-scoped publish their
 * engagement_id via `useChatScope({ engagement_id })` inside a useEffect.
 * MaiPanel reads `engagementId` and only includes it in the canonical
 * envelope when a page has explicitly published it.
 *
 * This prevents the assembler from loading engagement memory + Layer 3
 * policies (Meridian/Cascadia) when the operator is on a page that has
 * nothing to do with any engagement (e.g., /changes, /dashboards,
 * /operator-feed, /instrumentation, /pipeline in SE mode).
 *
 * Page state (visible_panels, counts, errors) belongs in SurfaceExtras.
 * Chat scope (engagement_id) belongs here. They are intentionally separate.
 */

interface ChatScopeContextValue {
  engagementId: string | null
  publishEngagementScope: (engagementId: string | null) => void
  clearEngagementScope: () => void
}

const ChatScopeContext = createContext<ChatScopeContextValue | undefined>(undefined)

export function ChatScopeProvider({ children }: { children: ReactNode }) {
  const [engagementId, setEngagementId] = useState<string | null>(null)

  const publishEngagementScope = useCallback((id: string | null) => {
    setEngagementId(id ?? null)
  }, [])

  const clearEngagementScope = useCallback(() => setEngagementId(null), [])

  const value = useMemo(
    () => ({ engagementId, publishEngagementScope, clearEngagementScope }),
    [engagementId, publishEngagementScope, clearEngagementScope],
  )

  return <ChatScopeContext.Provider value={value}>{children}</ChatScopeContext.Provider>
}

export function useChatScopeReader(): ChatScopeContextValue {
  const ctx = useContext(ChatScopeContext)
  if (!ctx) {
    throw new Error('useChatScopeReader must be used within ChatScopeProvider')
  }
  return ctx
}

/**
 * useChatScope — pages call this to publish (and auto-clear on unmount)
 * their engagement scope for the chat envelope.
 *
 * Pass null when the page is not engagement-scoped (e.g., SE pipeline
 * mode). This will explicitly clear any prior scope on mount + unmount,
 * so engagement memory cannot leak from a previous page.
 */
export function useChatScope(scope: { engagement_id: string | null }) {
  const ctx = useContext(ChatScopeContext)
  if (!ctx) {
    throw new Error('useChatScope must be used within ChatScopeProvider')
  }
  const { publishEngagementScope, clearEngagementScope } = ctx
  const id = scope.engagement_id ?? null

  useEffect(() => {
    publishEngagementScope(id)
    return () => clearEngagementScope()
  }, [id, publishEngagementScope, clearEngagementScope])
}
