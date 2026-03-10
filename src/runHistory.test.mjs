import test from 'node:test';
import assert from 'node:assert/strict';

import { extractRunHistoryDataset, formatRunStateLabel, summarizeJobRunHistory } from './runHistory.ts';

test('extractRunHistoryDataset groups array payload by job and sorts newest first', () => {
  const dataset = extractRunHistoryDataset([
    { jobId: 'job-b', status: 'ok', runAtMs: 1700000000000 },
    { jobId: 'job-a', status: 'error', summary: 'Provider timeout', ts: '2026-03-10T12:00:00.000Z' },
    { jobId: 'job-a', status: 'ok', runAtMs: 1700000001000 },
  ]);

  assert.equal(dataset.available, true);
  assert.deepEqual(Object.keys(dataset.runsByJobId).sort(), ['job-a', 'job-b']);
  assert.equal(dataset.runsByJobId['job-a'][0].status, 'error');
  assert.equal(dataset.runsByJobId['job-a'][1].status, 'ok');
});

test('extractRunHistoryDataset preserves per-job export errors', () => {
  const dataset = extractRunHistoryDataset({
    available: false,
    errorsByJobId: {
      'job-a': 'openclaw cron runs --id job-a failed',
    },
    runsByJobId: {
      'job-b': [{ jobId: 'job-b', status: 'ok', runAtMs: 1700000000000 }],
    },
  });

  assert.equal(dataset.errorsByJobId['job-a'], 'openclaw cron runs --id job-a failed');
  assert.equal(dataset.runsByJobId['job-b'].length, 1);
});

test('summarizeJobRunHistory surfaces the newest blocker detail', () => {
  const summary = summarizeJobRunHistory([
    {
      jobId: 'job-a',
      status: 'ok',
      summary: 'Delivered summary successfully',
      runAtMs: 1700000000000,
      delivered: true,
    },
    {
      jobId: 'job-a',
      status: 'failed',
      summary: 'Slack delivery failed after provider timeout',
      runAtMs: 1700001000000,
      delivered: false,
    },
  ]);

  assert.equal(summary.blockerTone, 'err');
  assert.match(summary.blockerDetail, /Slack delivery failed/i);
  assert.equal(summary.recentRuns.length, 2);
  assert.equal(formatRunStateLabel(summary.recentRuns[0]), 'failed');
});

test('summarizeJobRunHistory degrades gracefully when history is missing', () => {
  const summary = summarizeJobRunHistory([], { dataMissing: true });

  assert.equal(summary.blockerLabel, 'history missing');
  assert.equal(summary.blockerTone, 'idle');
  assert.match(summary.blockerDetail, /missing/i);
});
