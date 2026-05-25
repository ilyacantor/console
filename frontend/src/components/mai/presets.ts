/**
 * Mai preset suggestions — config-driven, per page context.
 *
 * When a tour stage is active, the per-stage preset config from
 * `demo/maiStageConfig.ts` overrides the page-based defaults.
 */

import { MAI_STAGE_CONFIG } from '../../demo/maiStageConfig'
import type { StageId } from '../../demo/seed'

const GENERIC_PRESETS: Record<string, string[]> = {
  pipeline: [
    "What's the pipeline status?",
    'When was the last run?',
    'What entities are configured?',
    'How does the pipeline work?',
  ],
  changes: [
    'What changed in the last 24 hours?',
    'Are there any critical alerts?',
    'What caused the latest drift?',
    'How does change detection work?',
  ],
  inspect: [
    'What domains have data?',
    'How many triples are in the store?',
    "What's the coverage breakdown?",
    'Show me the biggest unresolved conflicts',
  ],
  dashboards: [
    'What data is available for dashboards?',
    'How is revenue trending?',
    'What financial domains are covered?',
  ],
  upload: [
    'What file formats are supported?',
    'How does GL parsing work?',
    'What validations run on upload?',
  ],
}

export interface PresetContext {
  pageKey: string
  route?: string
  tourStageId?: StageId | null
}

export function buildPresets(ctx: PresetContext): string[] {
  if (ctx.tourStageId && ctx.tourStageId in MAI_STAGE_CONFIG) {
    return MAI_STAGE_CONFIG[ctx.tourStageId].presets
  }
  return GENERIC_PRESETS[ctx.pageKey] ?? []
}

export default GENERIC_PRESETS
