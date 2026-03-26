/**
 * Maestra preset suggestions — config-driven, per page context.
 *
 * To add or change presets, edit this file. No component code changes needed.
 */

const MAESTRA_PRESETS: Record<string, string[]> = {
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
  deal: [
    'Walk me through the COFA conflicts',
    "What's the engagement status?",
    'Show me the biggest adjustments',
    'How does the bridge work?',
  ],
  inspect: [
    'What domains have data?',
    'How many triples are in the store?',
    "What's the coverage breakdown?",
    'Show me top conflicts by dollar impact',
  ],
  dashboards: [
    'What data is available for dashboards?',
    'How is revenue trending?',
    'What financial domains are covered?',
  ],
  reports: [
    'What reports are available?',
    'Show me the income statement structure',
    'How does the combining report work?',
  ],
  upload: [
    'What file formats are supported?',
    'How does the GL parsing work?',
    'What validations run on upload?',
  ],
  engagements: [
    'What engagements are active?',
    'How does the engagement lifecycle work?',
    'What stages does an M&A engagement go through?',
  ],
};

export default MAESTRA_PRESETS;
