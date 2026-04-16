/**
 * Mai preset suggestions — config-driven, per page context.
 *
 * Default framing is generalist per Mai v8 blueprint §9. M&A/deal presets
 * are only surfaced when the operator is on an M&A/Convergence route with
 * an active engagement — see buildPresets() below.
 */

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
  reports: [
    'What reports are available?',
    'Show me the income statement structure',
    'How does report generation work?',
  ],
  upload: [
    'What file formats are supported?',
    'How does GL parsing work?',
    'What validations run on upload?',
  ],
  engagements: [
    'What engagements exist?',
    'How does the engagement lifecycle work?',
    'What are the stages of an engagement?',
  ],
};

// M&A-specific presets. Only surfaced on Convergence routes with an active
// engagement per §9 generalization charter.
const MA_PRESETS: Record<string, string[]> = {
  deal: [
    'Walk me through the COFA conflicts',
    "What's the engagement status?",
    'Show me the biggest adjustments',
    'How does the bridge work?',
  ],
  engagements: [
    'What engagements are active?',
    'How does the engagement lifecycle work?',
    'What stages does an M&A engagement go through?',
  ],
};

export interface PresetContext {
  pageKey: string;
  route?: string;
  hasActiveEngagement?: boolean;
  isConvergenceRoute?: boolean;
}

/** Return the preset list for a page, honoring the generalization charter. */
export function buildPresets(ctx: PresetContext): string[] {
  const onConvergence = ctx.isConvergenceRoute
    ?? (ctx.route?.startsWith('/convergence') ?? false);
  if (onConvergence && ctx.hasActiveEngagement) {
    return MA_PRESETS[ctx.pageKey] ?? GENERIC_PRESETS[ctx.pageKey] ?? [];
  }
  return GENERIC_PRESETS[ctx.pageKey] ?? [];
}

export default GENERIC_PRESETS;
