type AnyRecord = Record<string, unknown>;

export type CronRun = {
  ts?: string | number;
  jobId?: string;
  action?: string;
  status?: string;
  summary?: string;
  runAtMs?: number;
  durationMs?: number;
  nextRunAtMs?: number;
  model?: string;
  provider?: string;
  usage?: unknown;
  delivered?: boolean;
  deliveryStatus?: string;
  sessionId?: string;
  sessionKey?: string;
};

export type RunHistoryTone = 'ok' | 'err' | 'idle';

export type JobRunHistorySummary = {
  blockerDetail: string;
  blockerLabel: string;
  blockerTone: RunHistoryTone;
  problemCount: number;
  recentRuns: CronRun[];
};

export type RunHistoryDataset = {
  available: boolean;
  errorsByJobId: Record<string, string>;
  globalError: string;
  notice: string;
  runsByJobId: Record<string, CronRun[]>;
};

const MAX_RECENT_RUNS = 5;
const PROBLEM_TOKENS = ['fail', 'error', 'err', 'blocked', 'timeout', 'noise', 'noisy', 'warn', 'throttle', 'drop'];
const SUCCESS_TOKENS = ['ok', 'success', 'succeeded', 'complete', 'completed', 'delivered', 'sent'];

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object';
}

function maybeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function maybeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const numeric = Number(value.trim());
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return undefined;
}

function toEpochMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) return value;
    if (value > 1_000_000_000) return value * 1000;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return toEpochMs(numeric);
    }

    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function normalizeRun(value: unknown, fallbackJobId?: string): CronRun | null {
  if (!isRecord(value)) {
    return null;
  }

  const runAtMs = toEpochMs(value.runAtMs) ?? toEpochMs(value.ts);
  const durationMs = toFiniteNumber(value.durationMs);
  const nextRunAtMs = toEpochMs(value.nextRunAtMs);

  return {
    ts: typeof value.ts === 'string' || typeof value.ts === 'number' ? value.ts : undefined,
    jobId: maybeString(value.jobId) || fallbackJobId,
    action: maybeString(value.action) || undefined,
    status: maybeString(value.status) || undefined,
    summary: maybeString(value.summary) || undefined,
    runAtMs,
    durationMs,
    nextRunAtMs,
    model: maybeString(value.model) || undefined,
    provider: maybeString(value.provider) || undefined,
    usage: value.usage,
    delivered: maybeBoolean(value.delivered),
    deliveryStatus: maybeString(value.deliveryStatus) || undefined,
    sessionId: maybeString(value.sessionId) || undefined,
    sessionKey: maybeString(value.sessionKey) || undefined,
  };
}

function sortRunsDesc(runs: CronRun[]): CronRun[] {
  return [...runs].sort((left, right) => {
    const leftMs = left.runAtMs ?? toEpochMs(left.ts) ?? 0;
    const rightMs = right.runAtMs ?? toEpochMs(right.ts) ?? 0;
    return rightMs - leftMs;
  });
}

function groupRunsByJobId(runs: CronRun[]): Record<string, CronRun[]> {
  const grouped: Record<string, CronRun[]> = {};

  for (const run of runs) {
    if (!run.jobId) {
      continue;
    }

    if (!grouped[run.jobId]) {
      grouped[run.jobId] = [];
    }
    grouped[run.jobId].push(run);
  }

  for (const jobId of Object.keys(grouped)) {
    grouped[jobId] = sortRunsDesc(grouped[jobId]);
  }

  return grouped;
}

export function extractRuns(payload: unknown, fallbackJobId?: string): CronRun[] {
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeRun(item, fallbackJobId)).filter((item): item is CronRun => Boolean(item));
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ['runs', 'data', 'list', 'items']) {
    if (Array.isArray(payload[key])) {
      return extractRuns(payload[key], fallbackJobId);
    }
  }

  return [];
}

export function extractRunHistoryDataset(payload: unknown): RunHistoryDataset {
  const empty: RunHistoryDataset = {
    available: false,
    errorsByJobId: {},
    globalError: '',
    notice: 'Recent run history is unavailable for this snapshot.',
    runsByJobId: {},
  };

  if (Array.isArray(payload)) {
    const grouped = groupRunsByJobId(extractRuns(payload));
    return {
      ...empty,
      available: Object.keys(grouped).length > 0,
      notice: Object.keys(grouped).length > 0 ? '' : empty.notice,
      runsByJobId: grouped,
    };
  }

  if (!isRecord(payload)) {
    return empty;
  }

  const runsByJobId: Record<string, CronRun[]> = {};
  if (isRecord(payload.runsByJobId)) {
    for (const [jobId, value] of Object.entries(payload.runsByJobId)) {
      runsByJobId[jobId] = sortRunsDesc(extractRuns(value, jobId));
    }
  } else {
    Object.assign(runsByJobId, groupRunsByJobId(extractRuns(payload)));
  }

  const errorsByJobId = isRecord(payload.errorsByJobId)
    ? Object.fromEntries(
        Object.entries(payload.errorsByJobId)
          .filter(([, value]) => typeof value === 'string' && value.trim())
          .map(([jobId, value]) => [jobId, String(value).trim()]),
      )
    : {};

  const globalError = maybeString(payload.globalError);
  const available = typeof payload.available === 'boolean' ? payload.available : Object.keys(runsByJobId).length > 0;
  const notice =
    globalError ||
    maybeString(payload.notice) ||
    (available ? '' : Object.keys(errorsByJobId).length > 0 ? 'Recent run exports failed for one or more jobs.' : empty.notice);

  return {
    available,
    errorsByJobId,
    globalError,
    notice,
    runsByJobId,
  };
}

function includesAny(text: string, tokens: string[]): boolean {
  return tokens.some((token) => text.includes(token));
}

function isSuccessRun(run: CronRun): boolean {
  const text = [run.status, run.deliveryStatus, run.summary].filter(Boolean).join(' ').toLowerCase();
  if (run.delivered === true) {
    return true;
  }
  return Boolean(text) && includesAny(text, SUCCESS_TOKENS) && !includesAny(text, PROBLEM_TOKENS);
}

function isProblemRun(run: CronRun): boolean {
  const text = [run.status, run.deliveryStatus, run.summary, run.action].filter(Boolean).join(' ').toLowerCase();
  if (run.delivered === false) {
    return true;
  }
  return includesAny(text, PROBLEM_TOKENS) || (Boolean(text) && !isSuccessRun(run) && text.includes('retry'));
}

export function formatRunStateLabel(run: CronRun): string {
  return run.status || run.deliveryStatus || (run.delivered === false ? 'not delivered' : run.action || 'unknown');
}

function describeRun(run: CronRun): string {
  if (run.summary) {
    return run.summary;
  }

  const parts = [run.status, run.deliveryStatus, run.delivered === false ? 'not delivered' : '', run.action].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'No run details recorded.';
}

export function summarizeJobRunHistory(
  runs: CronRun[],
  options: { dataMissing?: boolean; exportError?: string } = {},
): JobRunHistorySummary {
  const allRuns = sortRunsDesc(runs);
  const recentRuns = allRuns.slice(0, MAX_RECENT_RUNS);
  const problemRuns = allRuns.filter(isProblemRun);
  const recentProblemCount = recentRuns.filter(isProblemRun).length;

  if (options.exportError) {
    return {
      blockerDetail: options.exportError,
      blockerLabel: 'export error',
      blockerTone: 'err',
      problemCount: recentProblemCount,
      recentRuns,
    };
  }

  if (problemRuns.length > 0) {
    return {
      blockerDetail: describeRun(problemRuns[0]),
      blockerLabel: recentProblemCount > 1 ? `${recentProblemCount}/${recentRuns.length} noisy` : 'latest blocker',
      blockerTone: 'err',
      problemCount: recentProblemCount,
      recentRuns,
    };
  }

  if (recentRuns.length === 0) {
    return {
      blockerDetail: options.dataMissing
        ? 'Run history snapshot is missing. Refresh data to inspect recent failures.'
        : 'No recent runs were exported for this job.',
      blockerLabel: options.dataMissing ? 'history missing' : 'no runs',
      blockerTone: 'idle',
      problemCount: 0,
      recentRuns,
    };
  }

  return {
    blockerDetail: describeRun(recentRuns[0]),
    blockerLabel: isSuccessRun(recentRuns[0]) ? 'clear' : 'recent run',
    blockerTone: isSuccessRun(recentRuns[0]) ? 'ok' : 'idle',
    problemCount: 0,
    recentRuns,
  };
}
