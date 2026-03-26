// TODO: Replace hardcoded entity data with Console API

import type { Mode } from '../context/ModeContext'

export interface EntityOption {
  id: string
  label: string
}

const SE_ENTITIES: EntityOption[] = [
  { id: 'meridian', label: 'Meridian' },
  { id: 'cascadia', label: 'Cascadia' },
]

const MA_PAIRS: EntityOption[] = [
  { id: 'meridian-cascadia', label: 'Meridian → Cascadia' },
]

const ME_GROUPS: EntityOption[] = [
  { id: 'meridian+cascadia', label: 'Meridian + Cascadia' },
]

const ALL_OPTIONS: EntityOption[] = [
  ...SE_ENTITIES,
  ...MA_PAIRS,
  ...ME_GROUPS,
]

export const ENTITIES_BY_MODE: Record<Mode, EntityOption[]> = {
  SE: SE_ENTITIES,
  MA: MA_PAIRS,
  ME: ME_GROUPS,
  ALL: ALL_OPTIONS,
}
