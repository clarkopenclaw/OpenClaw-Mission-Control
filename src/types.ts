import { Cron } from 'croner';

export type AnyRecord = Record<string, unknown>;

export type CronJob = {
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
  };
};

export type Agent = {
  id?: string;
  name?: string;
  model?: string;
  primaryModel?: string;
  isDefault?: boolean;
  bindings?: number;
  defaults?: { model?: { primary?: string } | string };
  agentDefaults?: { model?: string };
};

export type CronView = 'table' | 'agenda';

export type AgendaItem = {
  runAtMs: number;
  job: CronJob;
  agentId: string;
  enabled: boolean;
  status: string;
  scheduleExpr: string;
  scheduleTz: string;
  wasCapped: boolean;
  isPast?: boolean;
};

export type AgendaGroup = {
  key: string;
  heading: string;
  items: AgendaItem[];
};

export const AGENDA_LOOKAHEAD_DAYS = 7;
export const MAX_RUNS_PER_JOB = 20;
export const MAX_RUNS_PER_NOISY_JOB = 7;
export const MAX_ITERATIONS_PER_JOB = 500;
export const MAX_AGENDA_ITEMS_TOTAL = 250;
export const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';

export function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object';
}

export async function loadJson(path: string): Promise<unknown> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`);
  }
  return res.json();
}

export function pickAgentModel(agent: Agent): string {
  return (
    agent.model ||
    agent.primaryModel ||
    (isRecord(agent.defaults) && typeof agent.defaults.model === 'string' ? agent.defaults.model : undefined) ||
    (isRecord(agent.defaults) && isRecord(agent.defaults.model) ? String(agent.defaults.model.primary ?? '') : '') ||
    agent.agentDefaults?.model ||
    '--'
  );
}

export function extractJobs(payload: unknown): CronJob[] {
  if (Array.isArray(payload)) return payload as CronJob[];
  if (!isRecord(payload)) return [];
  const candidates = [payload.jobs, payload.data, payload.list, payload.items];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as CronJob[];
  }
  return [];
}

export function extractAgents(payload: unknown): Agent[] {
  if (Array.isArray(payload)) return payload as Agent[];
  if (!isRecord(payload)) return [];
  const candidates = [payload.agents, payload.data, payload.list, payload.items];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as Agent[];
  }
  return [];
}

export function formatSchedule(schedule: CronJob['schedule']): string {
  if (!schedule) return '--';
  const expr = schedule.expr || schedule.cron || '';
  const tz = schedule.tz || schedule.timezone || '';
  if (expr) return `${expr}${tz ? ` @ ${tz}` : ''}`.trim();
  return schedule.kind || '--';
}

export function formatDateFromMs(epochMs?: number): string {
  if (!epochMs || Number.isNaN(epochMs)) return '--';
  return new Date(epochMs).toLocaleString();
}

export function formatGeneratedAt(raw: unknown): string {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return 'No data';
  const epochMs = raw > 1_000_000_000_000 ? raw : raw * 1000;
  return new Date(epochMs).toLocaleString();
}

export function statusClass(value: string): string {
  const text = value.toLowerCase();
  if (text.includes('ok')) return 'status ok';
  if (text.includes('err') || text.includes('fail')) return 'status err';
  if (text.includes('idle')) return 'status idle';
  return 'status neutral';
}

export function getCronExpr(schedule?: CronJob['schedule']): string {
  if (!schedule) return '';
  return schedule.expr || schedule.cron || '';
}

export function getCronTz(schedule?: CronJob['schedule']): string {
  if (!schedule) return '';
  return schedule.tz || schedule.timezone || '';
}

export function dateKey(epochMs: number, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(new Date(epochMs));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function upcomingRunsForJob(job: CronJob, startAtMs: number, endAtMs: number): { runs: number[]; wasCapped: boolean } {
  const expr = getCronExpr(job.schedule);
  if (!expr) return { runs: [], wasCapped: false };
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
      if (runs.length > MAX_RUNS_PER_JOB * 6) break;
    }

    if (runs.length <= MAX_RUNS_PER_JOB) return { runs, wasCapped: false };

    const NOISY_INTERVAL_MS = 2 * 60 * 60 * 1000;
    const minGapMs = runs.length >= 2 ? Math.min(...runs.slice(1).map((ms, idx) => ms - runs[idx])) : Infinity;
    const isNoisy = minGapMs < NOISY_INTERVAL_MS;

    if (!isNoisy) return { runs: runs.slice(0, MAX_RUNS_PER_JOB), wasCapped: true };

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

export function buildAgendaItems(jobs: CronJob[], startAtMs: number, endAtMs: number): AgendaItem[] {
  const items: AgendaItem[] = [];

  for (const job of jobs) {
    const expr = getCronExpr(job.schedule);
    const tz = getCronTz(job.schedule);
    if (!expr) continue;

    const { runs, wasCapped } = upcomingRunsForJob(job, startAtMs, endAtMs);
    for (const runAtMs of runs) {
      items.push({
        runAtMs,
        job,
        agentId: job.agentId || '(default)',
        enabled: Boolean(job.enabled),
        status: job.state?.lastRunStatus || job.state?.lastStatus || '--',
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

export function groupAgendaByDay(items: AgendaItem[], timeZone?: string): AgendaGroup[] {
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
    .map(([key, value]) => ({
      key,
      heading: new Date(value.headingMs).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      items: value.items,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export type MarketInsights = {
  generatedAt: number;
  thesis: {
    title: string;
    pillars: { id: string; claim: string; watchFor: string[]; invalidation: string[] }[];
  };
  holdings: {
    positions: { ticker: string; shares: number }[];
    buyingPower: number;
    dailyChange: number;
    dailyChangePct: number;
  };
  themes: { id: string; name: string; agreeTickers: string[]; disagreeTickers: string[] }[];
};

export type SalesInsights = {
  generatedAt: number;
  pipeline: { total: number; byStage: Record<string, number> };
  signals: string[];
};

export type ResearchInsights = {
  generatedAt: number;
  entries: { date: string; problems: string[]; opportunity: string }[];
};

export type OpsInsights = {
  generatedAt: number;
  frictionCount: number;
  regressionCount: number;
  frictionTop: string[];
  regressionTop: string[];
};

export type LearningsInsights = {
  generatedAt: number;
  recent: { date: string; summary: string; area: string }[];
  decisionsNeeded: string[];
};

export function formatTime(epochMs: number, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  };
  const normalized = timeZone && timeZone.toLowerCase() !== 'local' ? timeZone : undefined;
  if (normalized) options.timeZone = normalized;
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
