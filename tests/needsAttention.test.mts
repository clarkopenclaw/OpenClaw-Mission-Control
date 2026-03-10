import test from 'node:test';
import assert from 'node:assert/strict';

import { getNeedsAttentionItems, summarizeNeedsAttention } from '../src/needsAttention.ts';

test('surfaces delivery misses, failures, and active runs in urgency order', () => {
  const nowMs = Date.UTC(2026, 2, 10, 20, 0, 0);
  const items = getNeedsAttentionItems(
    [
      {
        id: 'watchdog',
        name: 'Agent process watchdog',
        agentId: 'ops/watchdog',
        enabled: true,
        state: {
          lastDelivered: false,
          lastDeliveryStatus: 'not-delivered',
          lastDeliveryError: 'No heartbeat from recipient',
        },
      },
      {
        id: 'batch',
        name: 'Mission Control — Operating-gap PR batch',
        agentId: 'ops/batch',
        enabled: true,
        state: {
          runningAtMs: nowMs - 5 * 60_000,
          lastRunStatus: 'ok',
        },
      },
      {
        id: 'failer',
        name: 'Delivery reconciliation',
        agentId: 'ops/reconcile',
        enabled: true,
        state: {
          lastRunStatus: 'failed',
          consecutiveErrors: 2,
          lastError: 'API timeout',
        },
      },
    ],
    nowMs,
  );

  assert.equal(items.length, 3);
  assert.equal(items[0]?.name, 'Agent process watchdog');
  assert.equal(items[1]?.name, 'Delivery reconciliation');
  assert.equal(items[2]?.name, 'Mission Control — Operating-gap PR batch');
  assert.match(summarizeNeedsAttention(items), /1 delivery miss/);
  assert.match(summarizeNeedsAttention(items), /1 cron failure/);
  assert.match(summarizeNeedsAttention(items), /1 active run/);
});

test('combines multiple real issues for one job and skips disabled stale failures', () => {
  const nowMs = Date.UTC(2026, 2, 10, 20, 0, 0);
  const items = getNeedsAttentionItems(
    [
      {
        id: 'combined',
        name: 'Combined issue job',
        agentId: 'ops/combined',
        enabled: true,
        state: {
          lastDelivered: false,
          lastDeliveryStatus: 'not-delivered',
          consecutiveErrors: 3,
          lastRunStatus: 'failed',
          runningAtMs: nowMs - 60_000,
        },
      },
      {
        id: 'disabled',
        name: 'Disabled failure',
        agentId: 'ops/disabled',
        enabled: false,
        state: {
          lastRunStatus: 'failed',
          consecutiveErrors: 8,
        },
      },
    ],
    nowMs,
  );

  assert.equal(items.length, 1);
  assert.equal(items[0]?.reasons.length, 3);
  assert.equal(items[0]?.reasons[0]?.kind, 'delivery');
});

test('degrades gracefully when nothing needs attention', () => {
  const items = getNeedsAttentionItems([
    {
      id: 'ok',
      name: 'Healthy job',
      enabled: true,
      state: {
        lastRunStatus: 'ok',
        lastDelivered: true,
      },
    },
  ]);

  assert.deepEqual(items, []);
  assert.equal(
    summarizeNeedsAttention(items),
    'Nothing urgent right now. No delivery misses, cron failures, or active runs in current data.',
  );
});
