import { describe, it, expect } from 'vitest';
import {
  CronJob,
  classifyDeliveryHealth,
  deliveryHealthLabel,
  deliveryHealthClass,
  isDeliveryIssue,
  deliveryTooltip,
} from '../types';

function makeJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: 'test-id',
    name: 'test-job',
    enabled: true,
    delivery: { mode: 'announce', channel: 'slack', to: 'C12345' },
    state: {
      lastRunStatus: 'ok',
      lastDelivered: true,
      lastDeliveryStatus: 'delivered',
      consecutiveErrors: 0,
    },
    ...overrides,
  };
}

describe('classifyDeliveryHealth', () => {
  it('returns "disabled" for disabled jobs', () => {
    expect(classifyDeliveryHealth(makeJob({ enabled: false }))).toBe('disabled');
  });

  it('returns "healthy" when run ok and delivered', () => {
    expect(classifyDeliveryHealth(makeJob())).toBe('healthy');
  });

  it('returns "delivery-failed" when run ok but not delivered', () => {
    const job = makeJob({
      state: {
        lastRunStatus: 'ok',
        lastDelivered: false,
        lastDeliveryStatus: 'not-delivered',
        consecutiveErrors: 0,
      },
    });
    expect(classifyDeliveryHealth(job)).toBe('delivery-failed');
  });

  it('returns "run-failed" when run status is error', () => {
    const job = makeJob({
      state: {
        lastRunStatus: 'error',
        lastDelivered: false,
        lastDeliveryStatus: 'unknown',
        consecutiveErrors: 1,
      },
    });
    expect(classifyDeliveryHealth(job)).toBe('run-failed');
  });

  it('returns "best-effort-ok" when best-effort job delivers', () => {
    const job = makeJob({
      delivery: { mode: 'announce', channel: 'slack', to: 'C12345', bestEffort: true },
    });
    expect(classifyDeliveryHealth(job)).toBe('best-effort-ok');
  });

  it('returns "missing-target" when delivery.to is empty', () => {
    const job = makeJob({
      delivery: { mode: 'announce', channel: 'slack' },
    });
    expect(classifyDeliveryHealth(job)).toBe('missing-target');
  });

  it('returns "missing-target" when delivery object has no to field', () => {
    const job = makeJob({
      delivery: { mode: 'announce', channel: 'slack', to: '' },
    });
    expect(classifyDeliveryHealth(job)).toBe('missing-target');
  });

  it('returns "unknown" when delivery status is unknown', () => {
    const job = makeJob({
      state: {
        lastRunStatus: 'ok',
        lastDeliveryStatus: 'unknown',
        consecutiveErrors: 0,
      },
    });
    expect(classifyDeliveryHealth(job)).toBe('unknown');
  });

  it('returns "unknown" when no state exists', () => {
    const job = makeJob({ state: undefined });
    expect(classifyDeliveryHealth(job)).toBe('unknown');
  });

  it('prioritizes run-failed over missing-target', () => {
    const job = makeJob({
      delivery: { mode: 'announce', channel: 'slack' },
      state: { lastRunStatus: 'error', consecutiveErrors: 2 },
    });
    expect(classifyDeliveryHealth(job)).toBe('run-failed');
  });
});

describe('deliveryHealthLabel', () => {
  it('returns correct labels', () => {
    expect(deliveryHealthLabel('healthy')).toBe('delivered');
    expect(deliveryHealthLabel('delivery-failed')).toBe('not delivered');
    expect(deliveryHealthLabel('run-failed')).toBe('run failed');
    expect(deliveryHealthLabel('best-effort-ok')).toBe('best-effort');
    expect(deliveryHealthLabel('missing-target')).toBe('no target');
    expect(deliveryHealthLabel('disabled')).toBe('disabled');
    expect(deliveryHealthLabel('unknown')).toBe('unknown');
  });
});

describe('deliveryHealthClass', () => {
  it('returns ok class for healthy', () => {
    expect(deliveryHealthClass('healthy')).toBe('status ok');
  });

  it('returns err class for failures', () => {
    expect(deliveryHealthClass('delivery-failed')).toBe('status err');
    expect(deliveryHealthClass('run-failed')).toBe('status err');
    expect(deliveryHealthClass('missing-target')).toBe('status err');
  });

  it('returns warn class for best-effort', () => {
    expect(deliveryHealthClass('best-effort-ok')).toBe('status warn');
  });

  it('returns neutral for disabled', () => {
    expect(deliveryHealthClass('disabled')).toBe('status neutral');
  });

  it('returns idle for unknown', () => {
    expect(deliveryHealthClass('unknown')).toBe('status idle');
  });
});

describe('isDeliveryIssue', () => {
  it('returns true for delivery-failed, run-failed, missing-target', () => {
    expect(isDeliveryIssue('delivery-failed')).toBe(true);
    expect(isDeliveryIssue('run-failed')).toBe(true);
    expect(isDeliveryIssue('missing-target')).toBe(true);
  });

  it('returns false for healthy, best-effort-ok, disabled, unknown', () => {
    expect(isDeliveryIssue('healthy')).toBe(false);
    expect(isDeliveryIssue('best-effort-ok')).toBe(false);
    expect(isDeliveryIssue('disabled')).toBe(false);
    expect(isDeliveryIssue('unknown')).toBe(false);
  });
});

describe('deliveryTooltip', () => {
  it('returns formatted tooltip with channel and target', () => {
    const job = makeJob();
    const tip = deliveryTooltip(job);
    expect(tip).toContain('slack');
    expect(tip).toContain('C12345');
    expect(tip).toContain('delivered');
  });

  it('shows best-effort flag', () => {
    const job = makeJob({
      delivery: { mode: 'announce', channel: 'telegram', to: '@user', bestEffort: true },
    });
    const tip = deliveryTooltip(job);
    expect(tip).toContain('[best-effort]');
    expect(tip).toContain('telegram');
  });

  it('shows (none) when target is missing', () => {
    const job = makeJob({ delivery: { mode: 'announce', channel: 'slack' } });
    const tip = deliveryTooltip(job);
    expect(tip).toContain('(none)');
  });
});
