type CronState = {
  lastRunAtMs?: number;
  lastRunStatus?: string;
  lastStatus?: string;
  consecutiveErrors?: number;
  lastDelivered?: boolean | string;
  lastDeliveryStatus?: string;
  lastDeliveryError?: string;
  lastError?: string;
  runningAtMs?: number;
};

export type NeedsAttentionJob = {
  id?: string;
  name?: string;
  agentId?: string;
  enabled?: boolean;
  state?: CronState;
};

export type AttentionReasonKind = 'delivery' | 'failure' | 'running';
export type AttentionLevel = 'critical' | 'warning' | 'active';

export type AttentionReason = {
  kind: AttentionReasonKind;
  level: AttentionLevel;
  headline: string;
  detail: string;
};

export type NeedsAttentionItem = {
  key: string;
  name: string;
  agentId: string;
  enabled: boolean;
  priority: number;
  level: AttentionLevel;
  lastRunAtMs?: number;
  runningAtMs?: number;
  reasons: AttentionReason[];
};

function normalizeStatus(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function readErrorCount(state?: CronState): number {
  return typeof state?.consecutiveErrors === 'number' && Number.isFinite(state.consecutiveErrors)
    ? Math.max(0, state.consecutiveErrors)
    : 0;
}

function isFailureStatus(status: string): boolean {
  return status.includes('fail') || status.includes('error') || status.includes('err');
}

function isDeliveryFailureStatus(status: string): boolean {
  return status.includes('not-delivered') || status.includes('delivery-failed') || isFailureStatus(status);
}

function deliveryReason(state: CronState): AttentionReason | null {
  const delivered = state.lastDelivered;
  const deliveryStatus = normalizeStatus(state.lastDeliveryStatus);
  const deliveryError = typeof state.lastDeliveryError === 'string' ? state.lastDeliveryError.trim() : '';
  const hasMiss = delivered === false || delivered === 'false' || isDeliveryFailureStatus(deliveryStatus);

  if (!hasMiss) {
    return null;
  }

  return {
    kind: 'delivery',
    level: 'critical',
    headline: 'Delivery missed',
    detail: deliveryError || state.lastDeliveryStatus || 'Latest delivery did not complete.',
  };
}

function failureReason(state: CronState): AttentionReason | null {
  const runStatus = normalizeStatus(state.lastRunStatus || state.lastStatus);
  const consecutiveErrors = readErrorCount(state);
  const hasFailure = consecutiveErrors > 0 || isFailureStatus(runStatus);

  if (!hasFailure) {
    return null;
  }

  const headline =
    consecutiveErrors > 1 ? `${consecutiveErrors} consecutive cron failures` : 'Cron failure';

  return {
    kind: 'failure',
    level: consecutiveErrors > 1 ? 'critical' : 'warning',
    headline,
    detail: state.lastError?.trim() || state.lastRunStatus || state.lastStatus || 'Latest cron run failed.',
  };
}

function runningReason(state: CronState, nowMs: number): AttentionReason | null {
  if (typeof state.runningAtMs !== 'number' || !Number.isFinite(state.runningAtMs) || state.runningAtMs <= 0) {
    return null;
  }

  const startedAgoMinutes = Math.max(0, Math.round((nowMs - state.runningAtMs) / 60000));
  const detail = startedAgoMinutes > 0 ? `Started about ${startedAgoMinutes} min ago.` : 'Started just now.';

  return {
    kind: 'running',
    level: 'active',
    headline: 'Active run',
    detail,
  };
}

function levelRank(level: AttentionLevel): number {
  switch (level) {
    case 'critical':
      return 3;
    case 'warning':
      return 2;
    case 'active':
      return 1;
  }
}

function priorityForReasons(reasons: AttentionReason[], state: CronState | undefined, nowMs: number): number {
  let score = 0;

  for (const reason of reasons) {
    switch (reason.kind) {
      case 'delivery':
        score += 300;
        break;
      case 'failure':
        score += reason.level === 'critical' ? 220 : 180;
        break;
      case 'running':
        score += 120;
        break;
    }
  }

  score += Math.min(20, readErrorCount(state));
  if (typeof state?.runningAtMs === 'number' && Number.isFinite(state.runningAtMs)) {
    const startedAgoMinutes = Math.max(0, Math.round((nowMs - state.runningAtMs) / 60000));
    score += Math.max(0, 30 - Math.min(30, startedAgoMinutes));
  }

  return score;
}

function topLevelForReasons(reasons: AttentionReason[]): AttentionLevel {
  return reasons.reduce<AttentionLevel>((best, reason) => {
    return levelRank(reason.level) > levelRank(best) ? reason.level : best;
  }, 'active');
}

export function getNeedsAttentionItems(jobs: NeedsAttentionJob[], nowMs = Date.now()): NeedsAttentionItem[] {
  return jobs
    .flatMap((job) => {
      const state = job.state;
      if (!state) {
        return [];
      }

      const reasons = [deliveryReason(state), failureReason(state), runningReason(state, nowMs)].filter(
        (reason): reason is AttentionReason => Boolean(reason),
      );

      if (reasons.length === 0) {
        return [];
      }

      const enabled = Boolean(job.enabled);
      const hasActiveRun = reasons.some((reason) => reason.kind === 'running');

      if (!enabled && !hasActiveRun) {
        return [];
      }

      reasons.sort((left, right) => levelRank(right.level) - levelRank(left.level));

      return [
        {
          key: String(job.id || `${job.name || 'Unnamed job'}:${job.agentId || '(default)'}`),
          name: job.name || job.id || 'Unnamed job',
          agentId: job.agentId || '(default)',
          enabled,
          priority: priorityForReasons(reasons, state, nowMs),
          level: topLevelForReasons(reasons),
          lastRunAtMs: state.lastRunAtMs,
          runningAtMs: state.runningAtMs,
          reasons,
        },
      ];
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return left.name.localeCompare(right.name);
    });
}

export function summarizeNeedsAttention(items: NeedsAttentionItem[]): string {
  if (items.length === 0) {
    return 'Nothing urgent right now. No delivery misses, cron failures, or active runs in current data.';
  }

  const counts = items.reduce(
    (acc, item) => {
      for (const reason of item.reasons) {
        acc[reason.kind] += 1;
      }
      return acc;
    },
    { delivery: 0, failure: 0, running: 0 },
  );

  const parts = [
    counts.delivery ? `${counts.delivery} delivery miss${counts.delivery === 1 ? '' : 'es'}` : '',
    counts.failure ? `${counts.failure} cron failure${counts.failure === 1 ? '' : 's'}` : '',
    counts.running ? `${counts.running} active run${counts.running === 1 ? '' : 's'}` : '',
  ].filter(Boolean);

  return `Right now: ${parts.join(' • ')}.`;
}

export function attentionLevelClass(level: AttentionLevel): string {
  switch (level) {
    case 'critical':
      return 'err';
    case 'warning':
      return 'warn';
    case 'active':
      return 'ok';
  }
}
