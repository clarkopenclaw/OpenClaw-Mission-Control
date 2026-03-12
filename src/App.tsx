import { useEffect, useMemo, useState } from 'react';
import { Cron } from 'croner';

type AnyRecord = Record<string, unknown>;

type CronJob = {
  id?: string;
  name?: string;
  agentId?: string;
  enabled?: boolean;
  thinking?: string;
  payload?: { thinking?: string };
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
    lastDeliveryStatus?: string;
    lastDelivered?: boolean;
    lastError?: string;
    lastDeliveryError?: string;
    runningAtMs?: number;
  };
};

type Agent = {
  id?: string;
  model?: string;
  primaryModel?: string;
  defaults?: { model?: { primary?: string } | string };
  agentDefaults?: { model?: string };
};

type CronView = 'table' | 'week' | 'agenda' | 'history';
type HistoryStatusFilter = 'all' | 'ok' | 'error' | 'running' | 'other';

type AgendaItem = {
  runAtMs: number;
  job: CronJob;
  agentId: string;
  enabled: boolean;
  status: string;
  scheduleExpr: string;
  scheduleTz: string;
  wasCapped: boolean;
};

type AgendaGroup = {
  key: string;
  heading: string;
  items: AgendaItem[];
};

type RunHistoryIssue = {
  jobId: string;
  jobName: string;
  message: string;
};

type RunHistoryTruncation = {
  jobId: string;
  jobName: string;
  captured: number;
  total: number;
};

type CronRun = {
  key: string;
  jobId: string;
  jobName: string;
  agentId: string;
  enabled: boolean;
  status: string;
  action: string;
  runAtMs: number;
  finishedAtMs?: number;
  durationMs?: number;
  deliveryStatus: string;
  delivered?: boolean;
  model: string;
  provider: string;
  error: string;
  summary: string;
  totalTokens?: number;
  sessionId: string;
  sessionKey: string;
};

const AGENDA_LOOKAHEAD_DAYS = 7;
const MAX_RUNS_PER_JOB = 20;
const MAX_RUNS_PER_NOISY_JOB = 7;
const MAX_ITERATIONS_PER_JOB = 500;
const MAX_AGENDA_ITEMS_TOTAL = 250;
const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && !Number.isNaN(value) ? value : undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const next = getNumber(value);
    if (typeof next === 'number') {
      return next;
    }
  }
  return undefined;
}

function extractArray(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!isRecord(payload)) {
    return [];
  }

  for (const key of keys) {
    const candidate = payload[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

async function loadJson(path: string): Promise<unknown> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`);
  }
  return res.json();
}

function pickAgentModel(agent: Agent): string {
  return (
    agent.model ||
    agent.primaryModel ||
    (isRecord(agent.defaults) && typeof agent.defaults.model === 'string' ? agent.defaults.model : undefined) ||
    (isRecord(agent.defaults) && isRecord(agent.defaults.model) ? String(agent.defaults.model.primary ?? '') : '') ||
    agent.agentDefaults?.model ||
    '—'
  );
}

function extractJobs(payload: unknown): CronJob[] {
  return extractArray(payload, ['jobs', 'data', 'list', 'items']) as CronJob[];
}

function extractAgents(payload: unknown): Agent[] {
  return extractArray(payload, ['agents', 'data', 'list', 'items']) as Agent[];
}

function normalizeRunHistoryIssue(value: unknown): RunHistoryIssue | null {
  if (!isRecord(value)) {
    return null;
  }

  const jobId = firstString(value.jobId, value.id);
  if (!jobId) {
    return null;
  }

  return {
    jobId,
    jobName: firstString(value.jobName, value.name),
    message: firstString(value.message, value.error) || 'Failed to fetch run history.',
  };
}

function normalizeRunHistoryTruncation(value: unknown): RunHistoryTruncation | null {
  if (!isRecord(value)) {
    return null;
  }

  const jobId = firstString(value.jobId, value.id);
  const captured = firstNumber(value.captured, value.count);
  const total = firstNumber(value.total, value.available);
  if (!jobId || typeof captured !== 'number' || typeof total !== 'number') {
    return null;
  }

  return {
    jobId,
    jobName: firstString(value.jobName, value.name),
    captured,
    total,
  };
}

function extractRunHistoryPayload(payload: unknown): {
  runs: AnyRecord[];
  fetchErrors: RunHistoryIssue[];
  truncatedJobs: RunHistoryTruncation[];
} {
  const runs = extractArray(payload, ['runs', 'entries', 'data', 'list', 'items']).filter(isRecord);
  const fetchErrors = extractArray(payload, ['fetchErrors']).map(normalizeRunHistoryIssue).filter((value): value is RunHistoryIssue => value !== null);
  const truncatedJobs = extractArray(payload, ['truncatedJobs'])
    .map(normalizeRunHistoryTruncation)
    .filter((value): value is RunHistoryTruncation => value !== null);

  return { runs, fetchErrors, truncatedJobs };
}

function formatSchedule(schedule: CronJob['schedule']): string {
  if (!schedule) {
    return '—';
  }

  const expr = schedule.expr || schedule.cron || '';
  const tz = schedule.tz || schedule.timezone || '';

  if (expr) {
    return `cron ${expr}${tz ? ` @ ${tz}` : ''}`.trim();
  }

  return schedule.kind || '—';
}

function formatDateFromMs(epochMs?: number): string {
  if (!epochMs || Number.isNaN(epochMs)) {
    return '—';
  }
  return new Date(epochMs).toLocaleString();
}

function formatGeneratedAt(raw: unknown): string {
  if (typeof raw !== 'number' || Number.isNaN(raw)) {
    return 'No data found. Run ./refresh.sh.';
  }
  const epochMs = raw > 1_000_000_000_000 ? raw : raw * 1000;
  return new Date(epochMs).toLocaleString();
}

function formatDuration(durationMs?: number): string {
  if (!durationMs || Number.isNaN(durationMs) || durationMs <= 0) {
    return '—';
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatCount(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat().format(value);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function badgeClass(value: string): string {
  const text = value.toLowerCase();
  if (text.includes('not-delivered')) return 'badge err';
  if (text.includes('err') || text.includes('fail') || text.includes('block') || text.includes('timeout') || text.includes('cancel')) {
    return 'badge err';
  }
  if (text.includes('deliver') || text.includes('ok') || text.includes('success')) return 'badge ok';
  if (text.includes('idle')) return 'badge idle';
  return 'badge';
}

const CALENDAR_SLOT_MINUTES = 30;
const CALENDAR_MAX_CHIPS_PER_SLOT = 3;

function minuteOfLocalDay(epochMs: number): number {
  const d = new Date(epochMs);
  return d.getHours() * 60 + d.getMinutes();
}

function hash32(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (h << 5) - h + text.charCodeAt(i);
    h |= 0;
  }
  return h;
}

function colorForKey(key: string): string {
  const hue = Math.abs(hash32(key)) % 360;
  return `hsl(${hue} 70% 42%)`;
}

function slotLabel(slotIndex: number): string {
  const totalMinutes = slotIndex * CALENDAR_SLOT_MINUTES;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function slotLabelMaybe(slotIndex: number): string {
  const slotsPerHour = Math.floor(60 / CALENDAR_SLOT_MINUTES);
  return slotIndex % slotsPerHour === 0 ? slotLabel(slotIndex) : '';
}

function formatLocalTimeOfDay(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function shortenMiddle(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const keep = Math.max(2, Math.floor((maxLen - 1) / 2));
  return `${text.slice(0, keep)}…${text.slice(text.length - keep)}`;
}

function truncateText(text: string, maxLen: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLen) {
    return normalized;
  }
  return `${normalized.slice(0, maxLen - 1)}…`;
}

function firstLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';
}

function formatAgentId(agentId: string): string {
  const cleaned = agentId.replace(/^openclaw\//, '');
  return shortenMiddle(cleaned, 18);
}

function formatJobTooltip(item: AgendaItem): string {
  const whenLocal = formatTime(item.runAtMs);
  const name = item.job.name || '—';
  const jobTz = item.scheduleTz || LOCAL_TIME_ZONE;
  const cronLine = `cron ${item.scheduleExpr}${item.scheduleTz ? ` @ ${item.scheduleTz}` : ''}`;
  const statusLine = `Status: ${item.status}`;
  const enabledLine = `Enabled: ${item.enabled ? 'yes' : 'no'}`;
  const agentLine = `Agent: ${item.agentId}`;
  const jobLine = `Job time: ${formatTime(item.runAtMs, jobTz)} (${jobTz})`;

  return [`${whenLocal} — ${name}`, jobLine, statusLine, enabledLine, agentLine, cronLine].join('\n');
}

function buildDaySlots(items: AgendaItem[]): AgendaItem[][] {
  const slotCount = Math.ceil((24 * 60) / CALENDAR_SLOT_MINUTES);
  const slots: AgendaItem[][] = Array.from({ length: slotCount }, () => []);

  for (const item of items) {
    const minute = minuteOfLocalDay(item.runAtMs);
    const slotIdx = Math.max(0, Math.min(slotCount - 1, Math.floor(minute / CALENDAR_SLOT_MINUTES)));
    slots[slotIdx].push(item);
  }

  for (const slot of slots) {
    slot.sort((a, b) => a.runAtMs - b.runAtMs);
  }

  return slots;
}

function WeekTimeGrid({
  days,
}: {
  days: { key: string; heading: string; items: AgendaItem[] }[];
}) {
  const slotCount = Math.ceil((24 * 60) / CALENDAR_SLOT_MINUTES);

  return (
    <div className="week-timegrid" role="grid" aria-label="Cron calendar (aligned by time-of-day)">
      <div className="week-timegrid-header" role="row">
        <div className="week-timegrid-head week-timegrid-head-time" role="columnheader">
          Time
        </div>
        {days.map((day) => (
          <div key={day.key} className="week-timegrid-head week-timegrid-head-day" role="columnheader">
            <div className="week-timegrid-day-title">{day.heading}</div>
            <div className="week-timegrid-day-count small mono">{day.items.length}</div>
          </div>
        ))}
      </div>

      <div className="week-timegrid-body" role="rowgroup">
        <div className="week-timegrid-timecol" aria-hidden="true">
          {Array.from({ length: slotCount }, (_, slotIdx) => (
            <div key={slotIdx} className="week-timegrid-timecell">
              <span className="week-timegrid-timecell-label">{slotLabelMaybe(slotIdx)}</span>
            </div>
          ))}
        </div>

        <div className="week-timegrid-days">
          {days.map((day) => {
            const slots = buildDaySlots(day.items);

            return (
              <div key={day.key} className="week-timegrid-daycol" role="rowgroup" aria-label={day.heading}>
                {slots.map((slotItems, slotIdx) => {
                  const shown = slotItems.slice(0, CALENDAR_MAX_CHIPS_PER_SLOT);
                  const extra = Math.max(0, slotItems.length - shown.length);

                  return (
                    <div
                      key={slotIdx}
                      className={slotIdx % 2 === 0 ? 'week-timegrid-slot' : 'week-timegrid-slot alt'}
                      role="row"
                    >
                      <div className="week-timegrid-slot-inner">
                        {shown.map((item) => {
                          const key = String(item.job.id || item.job.name || item.agentId || 'job');
                          const color = colorForKey(key);

                          return (
                            <span
                              key={`${item.job.id || item.job.name}-${item.runAtMs}`}
                              className={item.enabled ? 'run-chip' : 'run-chip disabled'}
                              style={{ '--chip-color': color } as React.CSSProperties}
                              title={formatJobTooltip(item)}
                            >
                              <span className="run-chip-time mono">{formatLocalTimeOfDay(item.runAtMs)}</span>
                              <span className="run-chip-name">{item.job.name || '—'}</span>
                              <span className="run-chip-agent mono">{formatAgentId(item.agentId)}</span>
                              {!item.enabled ? <span className="badge idle">off</span> : null}
                              <span className={badgeClass(item.status)}>{item.status}</span>
                            </span>
                          );
                        })}
                        {extra ? <span className="run-chip more">+{extra}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatTime(epochMs: number, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  };

  const normalized = timeZone && timeZone.toLowerCase() !== 'local' ? timeZone : undefined;
  if (normalized) {
    options.timeZone = normalized;
  }

  try {
    return new Date(epochMs).toLocaleTimeString(undefined, options);
  } catch {
    return new Date(epochMs).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  }
}

function formatDayHeading(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function dateKey(epochMs: number, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(new Date(epochMs));

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function getCronExpr(schedule?: CronJob['schedule']): string {
  if (!schedule) {
    return '';
  }
  return schedule.expr || schedule.cron || '';
}

function getCronTz(schedule?: CronJob['schedule']): string {
  if (!schedule) {
    return '';
  }
  return schedule.tz || schedule.timezone || '';
}

function usageTotal(value: unknown): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return firstNumber(value.total_tokens, value.totalTokens, value.total);
}

function extractRunError(run: AnyRecord): string {
  const direct = firstString(run.error, run.err, run.lastError, run.lastDeliveryError);
  if (direct) {
    return direct;
  }

  if (isRecord(run.error)) {
    const nested = firstString(run.error.message, run.error.error, run.error.details);
    if (nested) {
      return nested;
    }
  }

  const summary = getString(run.summary);
  const statusText = firstString(run.status, run.action).toLowerCase();
  if (summary && (statusText.includes('err') || statusText.includes('fail') || statusText.includes('block') || statusText.includes('timeout'))) {
    return firstLine(summary);
  }

  return '';
}

function normalizeRun(
  run: AnyRecord,
  index: number,
  jobById: Map<string, CronJob>,
  modelByAgentId: Record<string, string>,
): CronRun | null {
  const rawJobId = firstString(run.jobId, run.id);
  const matchedJob = rawJobId ? jobById.get(rawJobId) : undefined;
  const runAtMs = firstNumber(run.runAtMs, run.startedAtMs, run.ts, run.createdAtMs);
  if (typeof runAtMs !== 'number') {
    return null;
  }

  const agentId = firstString(run.agentId, matchedJob?.agentId) || '(default)';
  const model = firstString(run.model, modelByAgentId[agentId], modelByAgentId['(default)']) || '—';
  const status = firstString(run.status, run.lastRunStatus, run.lastStatus) || '—';
  const action = firstString(run.action) || 'finished';
  const deliveryStatus =
    firstString(run.deliveryStatus) ||
    (typeof run.delivered === 'boolean' ? (run.delivered ? 'delivered' : 'not-delivered') : '—');
  const jobId = rawJobId || matchedJob?.id || `unknown-run-${index}`;

  return {
    key: firstString(run.sessionKey, run.sessionId) || `${jobId}-${runAtMs}-${index}`,
    jobId,
    jobName: firstString(run.jobName, run.name, matchedJob?.name) || 'Untitled job',
    agentId,
    enabled: typeof run.enabled === 'boolean' ? run.enabled : Boolean(matchedJob?.enabled),
    status,
    action,
    runAtMs,
    finishedAtMs: firstNumber(run.ts, run.finishedAtMs, run.completedAtMs),
    durationMs: firstNumber(run.durationMs, run.elapsedMs, matchedJob?.state?.lastDurationMs),
    deliveryStatus,
    delivered: typeof run.delivered === 'boolean' ? run.delivered : matchedJob?.state?.lastDelivered,
    model,
    provider: firstString(run.provider) || '—',
    error: extractRunError(run),
    summary: getString(run.summary),
    totalTokens: usageTotal(run.usage),
    sessionId: firstString(run.sessionId),
    sessionKey: firstString(run.sessionKey),
  };
}

function startOfDayMs(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function historyStatusBucket(run: Pick<CronRun, 'status' | 'action' | 'error'>): Exclude<HistoryStatusFilter, 'all'> {
  const text = `${run.status} ${run.action}`.toLowerCase();
  if (text.includes('run') || text.includes('start') || text.includes('queue')) {
    return 'running';
  }
  if (text.includes('ok') || text.includes('success')) {
    return 'ok';
  }
  if (run.error || text.includes('err') || text.includes('fail') || text.includes('block') || text.includes('timeout') || text.includes('cancel')) {
    return 'error';
  }
  return 'other';
}

function upcomingRunsForJob(job: CronJob, startAtMs: number, endAtMs: number): { runs: number[]; wasCapped: boolean } {
  const expr = getCronExpr(job.schedule);
  if (!expr) {
    return { runs: [], wasCapped: false };
  }

  const timezone = getCronTz(job.schedule);

  try {
    const cron = new Cron(expr, {
      timezone: timezone || undefined,
      mode: '5-part',
      legacyMode: true,
    });

    const runs: number[] = [];
    let cursor = new Date(startAtMs);

    for (let i = 0; i < MAX_ITERATIONS_PER_JOB; i += 1) {
      const next = cron.nextRun(cursor);
      if (!next) break;

      const nextMs = next.getTime();
      if (nextMs > endAtMs) break;

      runs.push(nextMs);
      cursor = new Date(nextMs + 1000);

      if (runs.length > MAX_RUNS_PER_JOB * 6) {
        break;
      }
    }

    if (runs.length <= MAX_RUNS_PER_JOB) {
      return { runs, wasCapped: false };
    }

    const noisyIntervalMs = 2 * 60 * 60 * 1000;
    const minGapMs = runs.length >= 2 ? Math.min(...runs.slice(1).map((ms, idx) => ms - runs[idx])) : Infinity;
    const isNoisy = minGapMs < noisyIntervalMs;

    if (!isNoisy) {
      return { runs: runs.slice(0, MAX_RUNS_PER_JOB), wasCapped: true };
    }

    const capped: number[] = [];
    const seenDays = new Set<string>();

    for (const runAtMs of runs) {
      const key = dateKey(runAtMs, timezone || undefined);
      if (seenDays.has(key)) continue;
      seenDays.add(key);
      capped.push(runAtMs);
      if (capped.length >= MAX_RUNS_PER_NOISY_JOB) break;
    }

    return { runs: capped, wasCapped: true };
  } catch {
    return { runs: [], wasCapped: false };
  }
}

function buildAgendaItems(jobs: CronJob[], startAtMs: number, endAtMs: number): AgendaItem[] {
  const items: AgendaItem[] = [];

  for (const job of jobs) {
    const expr = getCronExpr(job.schedule);
    const tz = getCronTz(job.schedule);
    if (!expr) continue;

    const { runs, wasCapped } = upcomingRunsForJob(job, startAtMs, endAtMs);

    for (const runAtMs of runs) {
      const agentId = job.agentId || '(default)';
      const status = job.state?.lastRunStatus || job.state?.lastStatus || '—';

      items.push({
        runAtMs,
        job,
        agentId,
        enabled: Boolean(job.enabled),
        status,
        scheduleExpr: expr,
        scheduleTz: tz,
        wasCapped,
      });
    }
  }

  items.sort((a, b) => {
    if (a.runAtMs !== b.runAtMs) return a.runAtMs - b.runAtMs;
    return String(a.job.name || '').localeCompare(String(b.job.name || ''));
  });

  return items;
}

function groupAgendaByDay(items: AgendaItem[], timeZone?: string): AgendaGroup[] {
  const groups = new Map<string, { headingMs: number; items: AgendaItem[] }>();

  for (const item of items) {
    const key = dateKey(item.runAtMs, timeZone);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, { headingMs: item.runAtMs, items: [item] });
    }
  }

  return Array.from(groups.entries())
    .map(([key, value]) => ({ key, heading: formatDayHeading(value.headingMs), items: value.items }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function searchableJobText(job: CronJob, modelByAgentId: Record<string, string>): string {
  const agentId = job.agentId || '(default)';
  const model = modelByAgentId[agentId] || modelByAgentId['(default)'] || '';
  const thinking = job.payload?.thinking || job.thinking || '';
  const status = job.state?.lastRunStatus || job.state?.lastStatus || '';
  const lastError = job.state?.lastError || job.state?.lastDeliveryError || '';

  return [job.name, job.id, agentId, model, thinking, formatSchedule(job.schedule), status, lastError]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();
}

function searchableRunText(run: CronRun): string {
  return [run.jobName, run.jobId, run.agentId, run.model, run.status, run.action, run.error, run.summary, run.deliveryStatus]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export default function App() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [modelByAgentId, setModelByAgentId] = useState<Record<string, string>>({});
  const [generatedAt, setGeneratedAt] = useState<string>('Loading...');
  const [error, setError] = useState<string>('');
  const [runHistoryError, setRunHistoryError] = useState<string>('');
  const [runs, setRuns] = useState<AnyRecord[]>([]);
  const [runFetchErrors, setRunFetchErrors] = useState<RunHistoryIssue[]>([]);
  const [truncatedRunJobs, setTruncatedRunJobs] = useState<RunHistoryTruncation[]>([]);
  const [query, setQuery] = useState<string>('');
  const [enabledOnly, setEnabledOnly] = useState<boolean>(false);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<HistoryStatusFilter>('all');
  const [historyErrorsOnly, setHistoryErrorsOnly] = useState<boolean>(false);
  const [refreshHint, setRefreshHint] = useState<string>('');
  const [cronView, setCronView] = useState<CronView>('table');

  useEffect(() => {
    void (async () => {
      setError('');
      setRunHistoryError('');

      const [metaResult, agentsResult, jobsResult, runsResult] = await Promise.allSettled([
        loadJson('/data/meta.json'),
        loadJson('/data/agents.json'),
        loadJson('/data/cron-jobs.json'),
        loadJson('/data/cron-runs.json'),
      ]);

      if (metaResult.status === 'fulfilled') {
        const metaPayload = metaResult.value;
        const generated = isRecord(metaPayload) ? metaPayload.generatedAt : undefined;
        setGeneratedAt(formatGeneratedAt(generated));
      } else {
        setGeneratedAt('No data found. Run ./refresh.sh.');
      }

      if (agentsResult.status === 'fulfilled') {
        const agentsPayload = agentsResult.value;
        const agents = extractAgents(agentsPayload);
        const nextModelByAgentId: Record<string, string> = {};

        for (const agent of agents) {
          if (agent?.id) {
            nextModelByAgentId[agent.id] = pickAgentModel(agent);
          }
        }

        const defaultModel =
          isRecord(agentsPayload) && isRecord(agentsPayload.defaults) && isRecord(agentsPayload.defaults.model)
            ? String(agentsPayload.defaults.model.primary ?? '')
            : isRecord(agentsPayload) && isRecord(agentsPayload.defaults) && typeof agentsPayload.defaults.model === 'string'
              ? agentsPayload.defaults.model
              : isRecord(agentsPayload) &&
                  isRecord(agentsPayload.agentDefaults) &&
                  typeof agentsPayload.agentDefaults.model === 'string'
                ? agentsPayload.agentDefaults.model
                : '';

        if (defaultModel) {
          nextModelByAgentId['(default)'] = defaultModel;
        }

        setModelByAgentId(nextModelByAgentId);
      } else {
        setModelByAgentId({});
      }

      if (jobsResult.status === 'fulfilled') {
        setJobs(extractJobs(jobsResult.value));
      } else {
        setJobs([]);
        setError(jobsResult.reason instanceof Error ? jobsResult.reason.message : 'Failed to load /data/cron-jobs.json');
      }

      if (runsResult.status === 'fulfilled') {
        const historyPayload = extractRunHistoryPayload(runsResult.value);
        setRuns(historyPayload.runs);
        setRunFetchErrors(historyPayload.fetchErrors);
        setTruncatedRunJobs(historyPayload.truncatedJobs);
      } else {
        setRuns([]);
        setRunFetchErrors([]);
        setTruncatedRunJobs([]);
        setRunHistoryError(
          runsResult.reason instanceof Error ? runsResult.reason.message : 'Failed to load /data/cron-runs.json',
        );
      }
    })();
  }, []);

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase();

    return jobs.filter((job) => {
      const haystack = searchableJobText(job, modelByAgentId);
      const passesQuery = !q || haystack.includes(q);
      const passesEnabled = !enabledOnly || Boolean(job.enabled);
      return passesQuery && passesEnabled;
    });
  }, [enabledOnly, jobs, modelByAgentId, query]);

  const agenda = useMemo(() => {
    const nowMs = Date.now();
    const startAtMs = nowMs;
    const endAtMs = startAtMs + AGENDA_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000;

    const allItems = buildAgendaItems(filteredJobs, startAtMs, endAtMs);
    const total = allItems.length;
    const shown = Math.min(total, MAX_AGENDA_ITEMS_TOTAL);
    const wasGlobalCapped = total > shown;
    const items = allItems.slice(0, shown);

    return {
      total,
      shown,
      wasGlobalCapped,
      groups: groupAgendaByDay(items),
    };
  }, [filteredJobs]);

  const week = useMemo(() => {
    const nowMs = Date.now();
    const rangeStartMs = nowMs;
    const rangeEndMs = rangeStartMs + 7 * 24 * 60 * 60 * 1000;

    const allItems = buildAgendaItems(filteredJobs, rangeStartMs, rangeEndMs);

    const total = allItems.length;
    const shown = Math.min(total, MAX_AGENDA_ITEMS_TOTAL);
    const wasGlobalCapped = total > shown;
    const items = allItems.slice(0, shown);

    const byDay = new Map<string, AgendaItem[]>();
    for (const item of items) {
      const key = dateKey(item.runAtMs);
      const list = byDay.get(key);
      if (list) list.push(item);
      else byDay.set(key, [item]);
    }

    const day0Ms = startOfDayMs(nowMs);

    const days = Array.from({ length: 7 }, (_, idx) => {
      const dayStartMs = day0Ms + idx * 24 * 60 * 60 * 1000;
      const key = dateKey(dayStartMs);
      const heading = formatDayHeading(dayStartMs);
      const list = byDay.get(key) ?? [];
      list.sort((a, b) => a.runAtMs - b.runAtMs);
      return { key, heading, items: list };
    });

    const label = new Date(day0Ms).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });

    const endLabel = new Date(day0Ms + 6 * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });

    return {
      total,
      shown,
      wasGlobalCapped,
      days,
      label: `${label}–${endLabel}`,
    };
  }, [filteredJobs]);

  const jobById = useMemo(() => {
    const map = new Map<string, CronJob>();
    for (const job of jobs) {
      if (job.id) {
        map.set(job.id, job);
      }
    }
    return map;
  }, [jobs]);

  const historyRuns = useMemo(() => {
    const normalized = runs
      .map((run, index) => normalizeRun(run, index, jobById, modelByAgentId))
      .filter((value): value is CronRun => value !== null);

    normalized.sort((left, right) => {
      if (left.runAtMs !== right.runAtMs) return right.runAtMs - left.runAtMs;
      return (right.finishedAtMs ?? 0) - (left.finishedAtMs ?? 0);
    });

    return normalized;
  }, [jobById, modelByAgentId, runs]);

  const filteredHistoryRuns = useMemo(() => {
    const q = query.trim().toLowerCase();

    return historyRuns.filter((run) => {
      const passesQuery = !q || searchableRunText(run).includes(q);
      const passesEnabled = !enabledOnly || run.enabled;
      const passesStatus = historyStatusFilter === 'all' || historyStatusBucket(run) === historyStatusFilter;
      const passesErrorsOnly = !historyErrorsOnly || Boolean(run.error);
      return passesQuery && passesEnabled && passesStatus && passesErrorsOnly;
    });
  }, [enabledOnly, historyErrorsOnly, historyRuns, historyStatusFilter, query]);

  const historySummary = useMemo(() => {
    const totalRuns = filteredHistoryRuns.length;
    const jobsTouched = new Set(filteredHistoryRuns.map((run) => run.jobId)).size;
    const okRuns = filteredHistoryRuns.filter((run) => historyStatusBucket(run) === 'ok').length;
    const errorRuns = filteredHistoryRuns.filter((run) => historyStatusBucket(run) === 'error').length;
    const durations = filteredHistoryRuns
      .map((run) => run.durationMs)
      .filter((value): value is number => typeof value === 'number' && value > 0);

    return {
      totalRuns,
      jobsTouched,
      okRuns,
      errorRuns,
      successRate: totalRuns ? (okRuns / totalRuns) * 100 : 0,
      avgDurationMs: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : undefined,
    };
  }, [filteredHistoryRuns]);

  const historyFetchNote = useMemo(() => {
    if (!runFetchErrors.length) {
      return '';
    }

    const first = runFetchErrors[0];
    const label = first.jobName || first.jobId;
    return `Refresh skipped ${runFetchErrors.length} job${runFetchErrors.length === 1 ? '' : 's'}. First issue: ${label}: ${first.message}`;
  }, [runFetchErrors]);

  const historyTruncationNote = useMemo(() => {
    if (!truncatedRunJobs.length) {
      return '';
    }

    const first = truncatedRunJobs[0];
    const label = first.jobName || first.jobId;
    return `Some jobs have more recorded runs than were captured in this refresh. Example: ${label} (${first.captured} of ${first.total}).`;
  }, [truncatedRunJobs]);

  return (
    <>
      <header className="header">
        <div>
          <h1>Mission Control</h1>
          <div className="sub">Local dashboard for OpenClaw cron health</div>
        </div>
        <div className="actions">
          <button
            type="button"
            onClick={() => setRefreshHint('Run ./refresh.sh from this repo, then reload this page.')}
          >
            Refresh data
          </button>
          <a className="button" href="http://127.0.0.1:18789/" target="_blank" rel="noreferrer">
            OpenClaw Control UI
          </a>
        </div>
      </header>

      <main className="container">
        <section className="card">
          <h2>Data</h2>
          <div className="mono">Generated: {generatedAt}</div>
          <div className="hint">
            Run <code>./refresh.sh</code> to refresh <code>/data/*.json</code>, including cron run history.
          </div>
          {refreshHint ? <div className="hint">{refreshHint}</div> : null}
        </section>

        <section className="card">
          <div className="card-title">
            <h2>Cron jobs</h2>
            <div className="segmented" role="group" aria-label="Cron jobs view">
              <button
                type="button"
                className={cronView === 'table' ? 'seg active' : 'seg'}
                onClick={() => setCronView('table')}
              >
                Table
              </button>
              <button
                type="button"
                className={cronView === 'week' ? 'seg active' : 'seg'}
                onClick={() => setCronView('week')}
              >
                Calendar
              </button>
              <button
                type="button"
                className={cronView === 'agenda' ? 'seg active' : 'seg'}
                onClick={() => setCronView('agenda')}
              >
                Agenda
              </button>
              <button
                type="button"
                className={cronView === 'history' ? 'seg active' : 'seg'}
                onClick={() => setCronView('history')}
              >
                History
              </button>
            </div>
          </div>

          <div className="filters">
            <input
              id="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by job, ID, agent, model, status…"
            />
            <label>
              <input type="checkbox" checked={enabledOnly} onChange={(event) => setEnabledOnly(event.target.checked)} />{' '}
              Enabled only
            </label>
          </div>

          {cronView === 'history' ? (
            <div className="history-toolbar">
              <label className="history-filter">
                <span className="small">Status</span>
                <select
                  value={historyStatusFilter}
                  onChange={(event) => setHistoryStatusFilter(event.target.value as HistoryStatusFilter)}
                >
                  <option value="all">All statuses</option>
                  <option value="ok">Success</option>
                  <option value="error">Errors</option>
                  <option value="running">Running</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="history-filter history-filter-checkbox">
                <input
                  type="checkbox"
                  checked={historyErrorsOnly}
                  onChange={(event) => setHistoryErrorsOnly(event.target.checked)}
                />{' '}
                Errors only
              </label>
            </div>
          ) : null}

          {error ? <div className="small">Failed to load jobs: {error}. Run ./refresh.sh.</div> : null}

          {cronView === 'table' ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Agent</th>
                  <th>Model</th>
                  <th>Thinking</th>
                  <th>Enabled</th>
                  <th>Schedule</th>
                  <th>Next</th>
                  <th>Last</th>
                  <th>Last status</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="small">
                      No jobs match filter.
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job, index) => {
                    const agentId = job.agentId || '(default)';
                    const model = modelByAgentId[agentId] || modelByAgentId['(default)'] || '—';
                    const thinking = job.payload?.thinking || job.thinking || '—';
                    const status = job.state?.lastRunStatus || job.state?.lastStatus || '—';

                    return (
                      <tr key={job.id || `${job.name || 'job'}-${index}`}>
                        <td>
                          <div>
                            <b>{job.name || '—'}</b>
                          </div>
                          <div className="small mono">{job.id || '—'}</div>
                        </td>
                        <td className="mono">{agentId}</td>
                        <td className="mono">{model}</td>
                        <td className="mono">{thinking}</td>
                        <td>
                          <span className="badge">{job.enabled ? 'enabled' : 'disabled'}</span>
                        </td>
                        <td className="mono">{formatSchedule(job.schedule)}</td>
                        <td className="mono">{formatDateFromMs(job.state?.nextRunAtMs)}</td>
                        <td className="mono">{formatDateFromMs(job.state?.lastRunAtMs)}</td>
                        <td>
                          <span className={badgeClass(status)}>{status}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : null}

          {cronView === 'agenda' ? (
            <div className="agenda">
              <div className="agenda-meta small">
                Upcoming run <b>instances</b> for the next {AGENDA_LOOKAHEAD_DAYS} days (a single job can appear multiple
                times). Noisy schedules are capped to one run/day.
                {agenda.wasGlobalCapped ? (
                  <span>
                    {' '}
                    Showing {agenda.shown} of {agenda.total} total instances.
                  </span>
                ) : null}
              </div>

              {agenda.groups.length === 0 ? (
                <div className="small">No upcoming runs found (or no cron expressions in current filter).</div>
              ) : (
                agenda.groups.map((group) => (
                  <div key={group.key} className="agenda-day">
                    <h3 className="agenda-heading">{group.heading}</h3>
                    <div className="agenda-list">
                      {group.items.map((item) => {
                        const model = modelByAgentId[item.agentId] || modelByAgentId['(default)'] || '—';
                        const jobTz = item.scheduleTz || LOCAL_TIME_ZONE;

                        return (
                          <div key={`${item.job.id || item.job.name}-${item.runAtMs}`} className="agenda-item">
                            <div className="agenda-time">
                              <div className="mono">Local: {formatTime(item.runAtMs)} ({LOCAL_TIME_ZONE})</div>
                              <div className="small mono">Job: {formatTime(item.runAtMs, jobTz)} ({jobTz})</div>
                            </div>

                            <div className="agenda-body">
                              <div className="agenda-title">
                                <b>{item.job.name || '—'}</b>
                                <span className="badge">{item.enabled ? 'enabled' : 'disabled'}</span>
                                <span className={badgeClass(item.status)}>{item.status}</span>
                                {item.wasCapped ? <span className="badge idle">capped</span> : null}
                              </div>
                              <div className="small mono">Agent: {item.agentId} · Model: {model}</div>
                              <div className="small mono">
                                cron {item.scheduleExpr}
                                {jobTz ? ` @ ${jobTz}` : ''}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}

          {cronView === 'week' ? (
            <div className="week">
              <div className="agenda-meta small">
                Calendar view ({week.label}). Upcoming run <b>instances</b> (next 7 days). Noisy schedules are capped to one run/day.
                {week.wasGlobalCapped ? (
                  <span>
                    {' '}
                    Showing {week.shown} of {week.total} total instances.
                  </span>
                ) : null}
              </div>

              <WeekTimeGrid days={week.days} />
            </div>
          ) : null}

          {cronView === 'history' ? (
            <div className="history">
              <div className="agenda-meta small">Recorded cron executions, newest first. Filters update both the stats and the log.</div>

              {runHistoryError ? (
                <div className="history-note">
                  Run history is unavailable right now ({runHistoryError}). Run <code>./refresh.sh</code> to generate{' '}
                  <code>/data/cron-runs.json</code>.
                </div>
              ) : null}

              {!runHistoryError && historyFetchNote ? <div className="history-note">{truncateText(historyFetchNote, 220)}</div> : null}
              {!runHistoryError && historyTruncationNote ? (
                <div className="history-note">{truncateText(historyTruncationNote, 220)}</div>
              ) : null}

              <div className="history-stats">
                <div className="history-stat">
                  <div className="small">Runs shown</div>
                  <div className="history-stat-value">{formatCount(historySummary.totalRuns)}</div>
                  <div className="small">{formatCount(historySummary.jobsTouched)} jobs in view</div>
                </div>
                <div className="history-stat">
                  <div className="small">Success rate</div>
                  <div className="history-stat-value">{formatPercent(historySummary.successRate)}</div>
                  <div className="small">{formatCount(historySummary.okRuns)} successful runs</div>
                </div>
                <div className="history-stat">
                  <div className="small">Error runs</div>
                  <div className="history-stat-value">{formatCount(historySummary.errorRuns)}</div>
                  <div className="small">Explicit failures or blocked runs</div>
                </div>
                <div className="history-stat">
                  <div className="small">Avg duration</div>
                  <div className="history-stat-value">{formatDuration(historySummary.avgDurationMs)}</div>
                  <div className="small">Across runs with a recorded duration</div>
                </div>
              </div>

              {filteredHistoryRuns.length === 0 ? (
                <div className="history-empty">
                  {runHistoryError
                    ? 'Run ./refresh.sh to generate history data, then reload this page.'
                    : 'No recorded runs match the current filters.'}
                </div>
              ) : (
                <div className="history-list">
                  {filteredHistoryRuns.map((run) => (
                    <article key={run.key} className="history-item">
                      <div className="history-item-top">
                        <div className="history-item-copy">
                          <div className="history-item-title">
                            <b>{run.jobName}</b>
                          </div>
                          <div className="small mono">{formatDateFromMs(run.runAtMs)}</div>
                        </div>
                        <div className="history-item-badges">
                          <span className={badgeClass(run.status)}>{run.status}</span>
                          {run.action && run.action !== 'finished' ? <span className="badge">{run.action}</span> : null}
                          <span className="badge">{run.enabled ? 'enabled' : 'disabled'}</span>
                          {run.deliveryStatus !== '—' ? (
                            <span className={badgeClass(run.deliveryStatus)}>{run.deliveryStatus}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="history-item-meta small mono">
                        Agent: {run.agentId} · Model: {run.model} · Duration: {formatDuration(run.durationMs)}
                        {run.totalTokens ? ` · Tokens: ${formatCount(run.totalTokens)}` : ''}
                      </div>
                      {run.finishedAtMs ? (
                        <div className="history-item-meta small mono">Finished: {formatDateFromMs(run.finishedAtMs)}</div>
                      ) : null}
                      {run.error ? <div className="history-item-error">{truncateText(run.error, 220)}</div> : null}
                      {run.summary ? <div className="history-item-summary">{truncateText(run.summary, 320)}</div> : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}
