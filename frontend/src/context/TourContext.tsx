/**
 * TourContext — drives the 9-stage deployment tour.
 *
 * Activates on `?tour=deploy` query param or via `enterTour(stageId)`.
 * Exposes the active stage and stage-navigation methods. Publishes
 * `tour_stage` into SurfaceExtras so Mai's `get_surface_state` sees it.
 *
 * Pure UI state — no network. Screens read the active snapshot via
 * `useEnvSnapshot`; they never need to call TourContext directly.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  STAGES,
  STAGE_BY_ID,
  FIRST_STAGE,
  stageAfter,
  stageBefore,
  type Stage,
  type StageId,
} from '../demo/seed'
import { MAI_STAGE_CONFIG } from '../demo/maiStageConfig'
import { useSurfaceExtras } from './SurfaceExtrasContext'

interface TourCtx {
  isActive: boolean
  activeStage: Stage | null
  activeStageId: StageId | null
  enterTour: (stageId?: StageId) => void
  exitTour: () => void
  advance: () => void
  back: () => void
  jumpTo: (stageId: StageId) => void
}

const TourContext = createContext<TourCtx | null>(null)

const TOUR_QUERY_PARAM = 'tour'
const TOUR_QUERY_VALUE = 'deploy'
const TOUR_STAGE_PARAM = 'stage'

export function TourProvider({ children }: { children: ReactNode }) {
  const [activeStageId, setActiveStageId] = useState<StageId | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()

  // Initialize from URL on mount and whenever URL changes externally.
  useEffect(() => {
    const tourParam = searchParams.get(TOUR_QUERY_PARAM)
    const stageParam = searchParams.get(TOUR_STAGE_PARAM)
    if (tourParam === TOUR_QUERY_VALUE) {
      if (stageParam && stageParam in STAGE_BY_ID) {
        setActiveStageId(stageParam as StageId)
      } else if (activeStageId === null) {
        setActiveStageId(FIRST_STAGE.id)
      }
    } else if (activeStageId !== null) {
      setActiveStageId(null)
    }
    // We intentionally do not depend on activeStageId here — only react to
    // external URL changes. Internal state changes update the URL via the
    // setters below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Mirror activeStageId into the URL so deep-links work and refresh persists.
  const writeUrl = useCallback(
    (stageId: StageId | null) => {
      const next = new URLSearchParams(searchParams)
      if (stageId === null) {
        next.delete(TOUR_QUERY_PARAM)
        next.delete(TOUR_STAGE_PARAM)
      } else {
        next.set(TOUR_QUERY_PARAM, TOUR_QUERY_VALUE)
        next.set(TOUR_STAGE_PARAM, stageId)
      }
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const goToStageRoute = useCallback(
    (stageId: StageId) => {
      const stage = STAGE_BY_ID[stageId]
      if (location.pathname !== stage.targetRoute) {
        const next = new URLSearchParams()
        next.set(TOUR_QUERY_PARAM, TOUR_QUERY_VALUE)
        next.set(TOUR_STAGE_PARAM, stageId)
        navigate(`${stage.targetRoute}?${next.toString()}`)
      } else {
        writeUrl(stageId)
      }
    },
    [location.pathname, navigate, writeUrl],
  )

  const enterTour = useCallback(
    (stageId?: StageId) => {
      const target = stageId ?? FIRST_STAGE.id
      setActiveStageId(target)
      goToStageRoute(target)
    },
    [goToStageRoute],
  )

  const exitTour = useCallback(() => {
    setActiveStageId(null)
    writeUrl(null)
  }, [writeUrl])

  const advance = useCallback(() => {
    if (activeStageId === null) return
    const next = stageAfter(activeStageId)
    if (next) {
      setActiveStageId(next.id)
      goToStageRoute(next.id)
    }
  }, [activeStageId, goToStageRoute])

  const back = useCallback(() => {
    if (activeStageId === null) return
    const prev = stageBefore(activeStageId)
    if (prev) {
      setActiveStageId(prev.id)
      goToStageRoute(prev.id)
    }
  }, [activeStageId, goToStageRoute])

  const jumpTo = useCallback(
    (stageId: StageId) => {
      setActiveStageId(stageId)
      goToStageRoute(stageId)
    },
    [goToStageRoute],
  )

  // Publish tour_stage + Mai per-stage hints into surface-extras so Mai's
  // get_surface_state tool returns them. Mai weaves system_addition into
  // her response framing and respects decline_rule per spec Section 4.
  useSurfaceExtras(
    'tour',
    activeStageId
      ? {
          extra: {
            tour_active: true,
            tour_stage: activeStageId,
            tour_stage_ordinal: STAGE_BY_ID[activeStageId].ordinal,
            tour_stage_title: STAGE_BY_ID[activeStageId].title,
            tour_total_stages: STAGES.length,
            tour_mai_addition: MAI_STAGE_CONFIG[activeStageId].system_addition,
            tour_mai_decline_rule: MAI_STAGE_CONFIG[activeStageId].decline_rule,
          },
        }
      : null,
  )

  const value = useMemo<TourCtx>(
    () => ({
      isActive: activeStageId !== null,
      activeStage: activeStageId ? STAGE_BY_ID[activeStageId] : null,
      activeStageId,
      enterTour,
      exitTour,
      advance,
      back,
      jumpTo,
    }),
    [activeStageId, enterTour, exitTour, advance, back, jumpTo],
  )

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}

export function useTour(): TourCtx {
  const ctx = useContext(TourContext)
  if (!ctx) {
    throw new Error('useTour must be used inside <TourProvider>')
  }
  return ctx
}
