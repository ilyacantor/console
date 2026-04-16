/**
 * Mai v8 §11.5 performance harness — 100-turn synthetic run against the
 * canonical Console → Platform → Sonnet chat path.
 *
 * Plan reference (Brain-BC plan §P13):
 *   Playwright 100-turn harness (Opus orchestration is the constraint, not
 *   Sonnet cost) vs §11.5 targets. If results ambiguous at 100 turns, flag
 *   for follow-up — do not expand sample size. Flag >50% misses for v8.0
 *   escalation (do not implement).
 *
 * Targets (§11.5 brain phase):
 *   first-token latency         p50 <2s,  p95 <4s
 *   full-turn latency           p50 <5s,  p95 <12s  (derived from §8.0 surface slos)
 *   chat history retrieval      p50 <100ms
 *   memory composition          p95 <200ms  (not directly observable — recorded via Platform logs)
 *   tool call success rate      >95%
 *   compression job success     >99%
 *
 * Run with:
 *   MAI_PERF_RUN=1 npx playwright test mai_v8_perf_harness.spec.ts
 *
 * Without MAI_PERF_RUN the test is skipped so CI doesn't burn 10 min per
 * commit — this harness runs at brain-phase exit gates only.
 *
 * Output:
 *   e2e/test-results/mai_v8_perf.json  — per-turn and aggregate metrics
 *   console.log                         — per-metric pass/fail table
 */

import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TURNS = Number.parseInt(process.env.MAI_PERF_TURNS ?? '100', 10);
const ENABLED = process.env.MAI_PERF_RUN === '1';

interface TurnMetric {
  index: number;
  prompt: string;
  first_token_ms: number;
  full_turn_ms: number;
  history_fetch_ms: number;
  tool_calls_ok: number;
  tool_calls_fail: number;
  error: string | null;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function pickPrompt(i: number): string {
  // Rotates through harmless generic queries that exercise the no-engagement
  // and with-engagement paths without leaking M&A vocabulary.
  const prompts = [
    "What's the pipeline status?",
    'How many triples are in the store?',
    'What domains have data?',
    'When was the last run?',
    'What entities are configured?',
    'Show me the coverage breakdown.',
    'What engagements exist?',
    'How does the pipeline work?',
    'What data is available for dashboards?',
    'What reports are available?',
  ];
  return prompts[i % prompts.length]!;
}

async function sendTurnAndMeasure(page: Page, index: number): Promise<TurnMetric> {
  const prompt = pickPrompt(index);
  const textarea = page.getByTestId('mai-input');
  const sendButton = page.getByTestId('mai-send');

  await textarea.fill(prompt);

  const t0 = performance.now();
  await sendButton.click();

  // First token = first visible content chunk in the streaming bubble.
  let firstTokenMs = Number.NaN;
  try {
    await page
      .getByTestId('mai-stream-buffer')
      .waitFor({ state: 'visible', timeout: 30_000 });
    firstTokenMs = performance.now() - t0;
  } catch (err) {
    return {
      index,
      prompt,
      first_token_ms: Number.NaN,
      full_turn_ms: Number.NaN,
      history_fetch_ms: Number.NaN,
      tool_calls_ok: 0,
      tool_calls_fail: 0,
      error: `first-token timeout: ${(err as Error).message}`,
    };
  }

  // Full turn = last assistant bubble gains a mai message matching the
  // index-th assistant response. The stream buffer empties on done.
  try {
    await page.waitForFunction(
      (expectedCount) =>
        document.querySelectorAll('[data-mai-role="mai"]').length >= expectedCount,
      index + 1,
      { timeout: 60_000 },
    );
  } catch (err) {
    return {
      index,
      prompt,
      first_token_ms: firstTokenMs,
      full_turn_ms: Number.NaN,
      history_fetch_ms: Number.NaN,
      tool_calls_ok: 0,
      tool_calls_fail: 0,
      error: `full-turn timeout: ${(err as Error).message}`,
    };
  }
  const fullTurnMs = performance.now() - t0;

  // Chat history fetch latency — direct HTTP hit through the Console proxy.
  const sessionId = await page.evaluate(
    () => window.localStorage.getItem('mai.session_id') ?? '',
  );
  const historyStart = performance.now();
  const historyResp = await page.request.get(
    `/api/proxy/platform/api/mai/chat/history?session_id=${encodeURIComponent(sessionId)}`,
  );
  const historyFetchMs = performance.now() - historyStart;
  const historyOk = historyResp.ok();

  return {
    index,
    prompt,
    first_token_ms: firstTokenMs,
    full_turn_ms: fullTurnMs,
    history_fetch_ms: historyOk ? historyFetchMs : Number.NaN,
    tool_calls_ok: 0, // populated by SSE instrumentation when available
    tool_calls_fail: 0,
    error: null,
  };
}

test.describe('Mai v8 §11.5 perf harness', () => {
  test.skip(!ENABLED, 'MAI_PERF_RUN=1 required to execute the 100-turn harness');
  test.setTimeout(60 * 60 * 1000);

  test(`${TURNS}-turn canonical chat against §11.5 targets`, async ({ page }) => {
    await page.goto('/');

    // Open the Mai float if it ships dormant.
    const float = page.getByTestId('mai-float-button');
    if (await float.isVisible().catch(() => false)) {
      await float.click();
    }

    const checkpointDir = path.resolve(__dirname, 'test-results');
    fs.mkdirSync(checkpointDir, { recursive: true });
    const checkpointFile = path.join(checkpointDir, 'mai_v8_perf_checkpoint.jsonl');
    fs.writeFileSync(checkpointFile, '');

    const metrics: TurnMetric[] = [];
    for (let i = 0; i < TURNS; i += 1) {
      // Small jitter to avoid hammering at 0ms between turns.
      await page.waitForTimeout(100);
      const m = await sendTurnAndMeasure(page, i);
      metrics.push(m);
      fs.appendFileSync(checkpointFile, JSON.stringify(m) + '\n');
    }

    const firstToken = metrics.map((m) => m.first_token_ms).filter((v) => Number.isFinite(v));
    const fullTurn = metrics.map((m) => m.full_turn_ms).filter((v) => Number.isFinite(v));
    const history = metrics.map((m) => m.history_fetch_ms).filter((v) => Number.isFinite(v));
    const errors = metrics.filter((m) => m.error !== null);

    const results = {
      turns: TURNS,
      completed: metrics.length - errors.length,
      failed: errors.length,
      first_token_p50_ms: percentile(firstToken, 50),
      first_token_p95_ms: percentile(firstToken, 95),
      full_turn_p50_ms: percentile(fullTurn, 50),
      full_turn_p95_ms: percentile(fullTurn, 95),
      history_fetch_p50_ms: percentile(history, 50),
      history_fetch_p95_ms: percentile(history, 95),
      raw: metrics,
    };

    const outDir = path.resolve(__dirname, 'test-results');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'mai_v8_perf.json'),
      JSON.stringify(results, null, 2),
    );

    const targets = {
      first_token_p50_ms: 2000,
      first_token_p95_ms: 4000,
      history_fetch_p50_ms: 100,
    };

    const rows: string[] = [
      '',
      'Mai v8 §11.5 perf harness results',
      '='.repeat(60),
      `turns: ${TURNS}  completed: ${results.completed}  failed: ${results.failed}`,
      '',
      'metric                              target     measured    status',
      '-'.repeat(60),
    ];
    const fmt = (label: string, measured: number, target: number) => {
      const ok = Number.isFinite(measured) && measured <= target;
      const flagMiss = Number.isFinite(measured) && measured > target * 1.5;
      const status = flagMiss ? 'FLAG v8.0' : ok ? 'PASS' : 'MISS';
      rows.push(
        `${label.padEnd(36)} ${String(target).padEnd(10)} ${measured.toFixed(0).padEnd(11)} ${status}`,
      );
    };
    fmt('first-token p50 (ms)', results.first_token_p50_ms, targets.first_token_p50_ms);
    fmt('first-token p95 (ms)', results.first_token_p95_ms, targets.first_token_p95_ms);
    fmt('chat history fetch p50 (ms)', results.history_fetch_p50_ms, targets.history_fetch_p50_ms);
    rows.push('-'.repeat(60));
    rows.push(
      `full-turn p50 (ms): ${results.full_turn_p50_ms.toFixed(0)}  p95: ${results.full_turn_p95_ms.toFixed(0)}`,
    );
    if (errors.length > 0) {
      rows.push('');
      rows.push(`ERRORS (${errors.length}):`);
      for (const e of errors.slice(0, 5)) {
        rows.push(`  turn ${e.index}: ${e.error}`);
      }
      if (errors.length > 5) rows.push(`  ... ${errors.length - 5} more`);
    }
    rows.push('');
    // eslint-disable-next-line no-console
    console.log(rows.join('\n'));

    // Hard-fail only on wildly missed targets (flag for v8.0 per plan).
    expect(
      results.first_token_p50_ms,
      'first-token p50 flag (>3s = >50% miss of 2s target)',
    ).toBeLessThan(3000);
  });
});
