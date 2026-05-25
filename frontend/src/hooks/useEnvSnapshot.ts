/**
 * useEnvSnapshot — surfaces the active tour snapshot.
 *
 * When a tour stage is active, returns the StageId so callers can select
 * seeded data from `demo/seed.ts`. When no tour is active, returns null
 * and screens fall through to their real API path.
 *
 * Pattern:
 *   const snapshot = useEnvSnapshot()
 *   if (snapshot) {
 *     return aodAppsAtStage(snapshot)   // seeded
 *   }
 *   return await fetchRealAodApps()     // live
 */

import { useTour } from '../context/TourContext'
import type { StageId } from '../demo/seed'

export function useEnvSnapshot(): StageId | null {
  const { activeStageId } = useTour()
  return activeStageId
}
