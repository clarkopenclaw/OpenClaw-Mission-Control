export type CronJob = {
  id?: string;
  name?: string;
  agentId?: string;
  enabled?: boolean;
  thinking?: string;
  createdAtMs?: number;
  updatedAtMs?: number;
  payload?: {
    thinking?: string;
    message?: string;
  };
  delivery?: {
    mode?: string;
    channel?: string;
    to?: string;
    bestEffort?: boolean;
  };
  schedule?: {
    kind?: string;
    expr?: string;
    cron?: string;
    tz?: string;
    timezone?: string;
  };
  state?: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastRunStatus?: string;
    lastStatus?: string;
    lastDurationMs?: number;
    lastDelivered?: boolean;
    lastDeliveryStatus?: string;
    consecutiveErrors?: number;
    lastError?: string;
    lastDeliveryError?: string;
    runningAtMs?: number;
  };
};

export type HomepageItem = {
  key: string;
  name: string;
  agentId: string;
  model: string;
  enabled: boolean;
  status: string;
  deliveryStatus: string;
  reason: string;
  lastRunAtMs?: number;
  nextRunAtMs?: number;
  updatedAtMs?: number;
};

export type HomepageModel = {
  needsAttention: HomepageItem[];
  waitingOnRyan: HomepageItem[];
  recentlyShipped: HomepageItem[];
};

const MAX_ITEMS_PER_LANE = 6;

const STRONG_APPROVAL_PATTERNS = [
  /reply\s+["']approve["']/i,
  /needs_[a-z_]*approval/i,
  /approve patch yes\/no/i,
  /approve a specific set of schedule edits/i,
  /not approved/i,
  /copy not approved/i,
];

const MANUAL_DECISION_PATTERNS = [/ryan can decide manually/i];
const ASK_RYAN_PATTERN = /ask Ryan/i;
const AUTH_BLOCKER_PATTERN = /auth|login|permission|token/i;
const EXPECTED_NO_DELIVERY_PATTERNS = [/no[_ -]?reply/i, /only alert on anomalies/i];
const OPTIONAL_APPROVAL_PATTERN = /\bor Done\b/i;

function promptText(job: CronJob): string {
  return [job.name ?? '', job.payload?.message ?? ''].join('\n');
}

function statusText(job: CronJob): string {
  return job.state?.lastRunStatus || job.state?.lastStatus || '—';
}

function deliveryStatusText(job: CronJob): string {
  if (job.state?.lastDeliveryStatus) {
    return job.state.lastDeliveryStatus;
  }
  if (job.state?.lastDelivered) {
    return 'delivered';
  }
  return '—';
}

function hasRunState(job: CronJob): boolean {
  return Boolean(job.state?.lastRunAtMs || job.state?.lastRunStatus || job.state?.lastStatus);
}

function isExpectedNoDelivery(job: CronJob): boolean {
  const text = promptText(job);
  return EXPECTED_NO_DELIVERY_PATTERNS.some((pattern) => pattern.test(text));
}

function sortTimestamp(value?: number): number {
  return typeof value === 'number' && !Number.isNaN(value) ? value : 0;
}

function makeItem(job: CronJob, modelByAgentId: Record<string, string>, reason: string, index: number): HomepageItem {
  const agentId = job.agentId || '(default)';
  return {
    key: job.id || `${job.name || 'job'}-${agentId}-${index}`,
    name: job.name || 'Untitled job',
    agentId,
    model: modelByAgentId[agentId] || modelByAgentId['(default)'] || '—',
    enabled: Boolean(job.enabled),
    status: statusText(job),
    deliveryStatus: deliveryStatusText(job),
    reason,
    lastRunAtMs: job.state?.lastRunAtMs,
    nextRunAtMs: job.state?.nextRunAtMs,
    updatedAtMs: job.updatedAtMs,
  };
}

function attentionSignal(job: CronJob): { priority: number; reason: string } | null {
  const consecutiveErrors = job.state?.consecutiveErrors ?? 0;
  const status = statusText(job);
  const normalizedStatus = status.toLowerCase();

  if (consecutiveErrors > 0) {
    return {
      priority: 500 + consecutiveErrors,
      reason: `${consecutiveErrors} consecutive ${consecutiveErrors === 1 ? 'error' : 'errors'}`,
    };
  }

  if (status !== '—' && !normalizedStatus.includes('ok')) {
    return { priority: 450, reason: `Last run ${status}` };
  }

  if (job.state?.lastDeliveryError) {
    return { priority: 400, reason: 'Delivery failed' };
  }

  if (job.state?.lastError) {
    return { priority: 350, reason: 'Error recorded' };
  }

  if (job.enabled && !hasRunState(job)) {
    return { priority: 300, reason: 'Enabled but missing run state' };
  }

  const deliveryStatus = deliveryStatusText(job).toLowerCase();
  if ((deliveryStatus.includes('not-delivered') || deliveryStatus.includes('unknown')) && !isExpectedNoDelivery(job)) {
    return { priority: 250, reason: 'Unexpected delivery failure' };
  }

  return null;
}

function waitingSignal(job: CronJob): { priority: number; reason: string } | null {
  const text = promptText(job);

  if (STRONG_APPROVAL_PATTERNS.some((pattern) => pattern.test(text))) {
    const isAdvisoryApproval = OPTIONAL_APPROVAL_PATTERN.test(text);
    if (!isAdvisoryApproval || !job.enabled || !hasRunState(job)) {
      return { priority: 400, reason: 'Approval needed' };
    }
  }

  if (MANUAL_DECISION_PATTERNS.some((pattern) => pattern.test(text))) {
    return { priority: 350, reason: 'Ryan decision needed' };
  }

  if (ASK_RYAN_PATTERN.test(text) && AUTH_BLOCKER_PATTERN.test(text)) {
    const activeErrorText = [job.state?.lastError, job.state?.lastDeliveryError].filter(Boolean).join(' ');
    if (AUTH_BLOCKER_PATTERN.test(activeErrorText)) {
      return { priority: 300, reason: 'Ryan unblock requested' };
    }
  }

  return null;
}

function isRecentlyShipped(job: CronJob): boolean {
  const status = statusText(job).toLowerCase();
  const deliveryStatus = deliveryStatusText(job).toLowerCase();
  return Boolean(job.state?.lastRunAtMs) && status.includes('ok') && (job.state?.lastDelivered === true || deliveryStatus === 'delivered');
}

export function buildHomepageModel(jobs: CronJob[], modelByAgentId: Record<string, string>): HomepageModel {
  const needsAttention = jobs
    .map((job, index) => {
      const signal = attentionSignal(job);
      if (!signal) return null;
      return { item: makeItem(job, modelByAgentId, signal.reason, index), priority: signal.priority };
    })
    .filter((value): value is { item: HomepageItem; priority: number } => value !== null)
    .sort((left, right) => {
      if (left.priority !== right.priority) return right.priority - left.priority;
      if (left.item.enabled !== right.item.enabled) return Number(right.item.enabled) - Number(left.item.enabled);
      const runDiff = sortTimestamp(right.item.lastRunAtMs) - sortTimestamp(left.item.lastRunAtMs);
      if (runDiff !== 0) return runDiff;
      return sortTimestamp(right.item.updatedAtMs) - sortTimestamp(left.item.updatedAtMs);
    })
    .slice(0, MAX_ITEMS_PER_LANE)
    .map(({ item }) => item);

  const waitingOnRyan = jobs
    .map((job, index) => {
      const signal = waitingSignal(job);
      if (!signal) return null;
      return { item: makeItem(job, modelByAgentId, signal.reason, index), priority: signal.priority };
    })
    .filter((value): value is { item: HomepageItem; priority: number } => value !== null)
    .sort((left, right) => {
      if (left.priority !== right.priority) return right.priority - left.priority;
      if (left.item.enabled !== right.item.enabled) return Number(right.item.enabled) - Number(left.item.enabled);
      const updatedDiff = sortTimestamp(right.item.updatedAtMs) - sortTimestamp(left.item.updatedAtMs);
      if (updatedDiff !== 0) return updatedDiff;
      return sortTimestamp(right.item.lastRunAtMs) - sortTimestamp(left.item.lastRunAtMs);
    })
    .slice(0, MAX_ITEMS_PER_LANE)
    .map(({ item }) => item);

  const recentlyShipped = jobs
    .filter(isRecentlyShipped)
    .map((job, index) => makeItem(job, modelByAgentId, 'Delivered successfully', index))
    .sort((left, right) => {
      const runDiff = sortTimestamp(right.lastRunAtMs) - sortTimestamp(left.lastRunAtMs);
      if (runDiff !== 0) return runDiff;
      return sortTimestamp(right.updatedAtMs) - sortTimestamp(left.updatedAtMs);
    })
    .slice(0, MAX_ITEMS_PER_LANE);

  return {
    needsAttention,
    waitingOnRyan,
    recentlyShipped,
  };
}
