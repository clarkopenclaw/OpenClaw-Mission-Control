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
  };
};

type Agent = {
  id?: string;
  model?: string;
  primaryModel?: string;
  defaults?: { model?: { primary?: string } | string };
  agentDefaults?: { model?: string };
};

type CronView = 'table' | 'week' | 'agenda';

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

const AGENDA_LOOKAHEAD_DAYS = 7;
const MAX_RUNS_PER_JOB = 20;
const MAX_RUNS_PER_NOISY_JOB = 7;
const MAX_ITERATIONS_PER_JOB = 500;
const MAX_AGENDA_ITEMS_TOTAL = 250;
const WEEK_STARTS_ON: 0 | 1 = 1; // 0 = Sunday, 1 = Monday

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object';
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
  if (Array.isArray(payload)) {
    return payload as CronJob[];
  }
  if (!isRecord(payload)) {
    return [];
  }

  const candidates = [payload.jobs, payload.data, payload.list, payload.items];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as CronJob[];
    }
  }

  return [];
}

function extractAgents(payload: unknown): Agent[] {
  if (Array.isArray(payload)) {
    return payload as Agent[];
  }
  if (!isRecord(payload)) {
    return [];
  }

  const candidates = [payload.agents, payload.data, payload.list, payload.items];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as Agent[];
    }
  }

  return [];
}

function formatSchedule(schedule: CronJob['schedule']): string {
  if (!schedule) {
    return '—';
  }
  if (schedule.kind === 'cron') {
    const expr = schedule.expr || schedule.cron || '';
    const tz = schedule.tz || schedule.timezone || '';
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

function badgeClass(value: string): string {
  const text = value.toLowerCase();
  if (text.includes('ok')) return 'badge ok';
  if (text.includes('err') || text.includes('fail')) return 'badge err';
  if (text.includes('idle')) return 'badge idle';
  return 'badge';
}

function formatTime(epochMs: number, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  };

  if (timeZone) {
    options.timeZone = timeZone;
  }

  return new Date(epochMs).toLocaleTimeString(undefined, options);
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
  if (!schedule || schedule.kind !== 'cron') {
    return '';
  }
  return schedule.expr || schedule.cron || '';
}

function getCronTz(schedule?: CronJob['schedule']): string {
  if (!schedule || schedule.kind !== 'cron') {
    return '';
  }
  return schedule.tz || schedule.timezone || '';
}

function startOfWeekMs(epochMs: number, weekStartsOn: 0 | 1): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);

  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d.getTime();
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

      // Avoid accidental infinite loops if a library returns the same run time.
      cursor = new Date(nextMs + 1000);

      // For very noisy schedules, stop collecting candidates once we know we must cap.
      if (runs.length > MAX_RUNS_PER_JOB * 6) {
        break;
      }
    }

    if (runs.length <= MAX_RUNS_PER_JOB) {
      return { runs, wasCapped: false };
    }

    // Decide if this is "noisy" (e.g. */30). If so, show at most 1 run/day.
    const NOISY_INTERVAL_MS = 2 * 60 * 60 * 1000;
    const minGapMs = runs.length >= 2 ? Math.min(...runs.slice(1).map((ms, idx) => ms - runs[idx])) : Infinity;
    const isNoisy = minGapMs < NOISY_INTERVAL_MS;

    if (!isNoisy) {
      return { runs: runs.slice(0, MAX_RUNS_PER_JOB), wasCapped: true };
    }

    // Noisy schedule: show only the first run per day in the job's timezone (or local if tz missing).
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

export default function App() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [modelByAgentId, setModelByAgentId] = useState<Record<string, string>>({});
  const [generatedAt, setGeneratedAt] = useState<string>('Loading...');
  const [error, setError] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [enabledOnly, setEnabledOnly] = useState<boolean>(false);
  const [refreshHint, setRefreshHint] = useState<string>('');
  const [cronView, setCronView] = useState<CronView>('table');

  useEffect(() => {
    void (async () => {
      setError('');

      const [metaResult, agentsResult, jobsResult] = await Promise.allSettled([
        loadJson('/data/meta.json'),
        loadJson('/data/agents.json'),
        loadJson('/data/cron-jobs.json'),
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
    })();
  }, []);

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase();

    return jobs.filter((job) => {
      const name = String(job.name || '').toLowerCase();
      const agentId = String(job.agentId || '').toLowerCase();
      const passesQuery = !q || name.includes(q) || agentId.includes(q);
      const passesEnabled = !enabledOnly || Boolean(job.enabled);
      return passesQuery && passesEnabled;
    });
  }, [enabledOnly, jobs, query]);

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
    const weekStartMs = startOfWeekMs(nowMs, WEEK_STARTS_ON);
    const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000;

    const allItems = buildAgendaItems(filteredJobs, weekStartMs, weekEndMs).filter((item) => item.runAtMs >= nowMs);

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

    const days = Array.from({ length: 7 }, (_, idx) => {
      const dayStartMs = weekStartMs + idx * 24 * 60 * 60 * 1000;
      const key = dateKey(dayStartMs);
      const heading = formatDayHeading(dayStartMs);
      const list = byDay.get(key) ?? [];
      list.sort((a, b) => a.runAtMs - b.runAtMs);
      return { key, heading, items: list };
    });

    const label = new Date(weekStartMs).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });

    const endLabel = new Date(weekStartMs + 6 * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, {
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
            onClick={() => setRefreshHint('Run ./refresh.sh in ~/Documents/mission-control, then reload this page.')}
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
            Run <code>./refresh.sh</code> to refresh <code>/data/*.json</code>.
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
                Week
              </button>
              <button
                type="button"
                className={cronView === 'agenda' ? 'seg active' : 'seg'}
                onClick={() => setCronView('agenda')}
              >
                Agenda
              </button>
            </div>
          </div>

          <div className="filters">
            <input
              id="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name/agent…"
            />
            <label>
              <input type="checkbox" checked={enabledOnly} onChange={(event) => setEnabledOnly(event.target.checked)} />{' '}
              Enabled only
            </label>
          </div>

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
                        const jobTz = item.scheduleTz;

                        return (
                          <div key={`${item.job.id || item.job.name}-${item.runAtMs}`} className="agenda-item">
                            <div className="agenda-time">
                              <div className="mono">{formatTime(item.runAtMs)}</div>
                              {jobTz ? (
                                <div className="small mono">
                                  {formatTime(item.runAtMs, jobTz)} ({jobTz})
                                </div>
                              ) : null}
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
                Week view ({week.label}). Upcoming run <b>instances</b> only. Noisy schedules are capped to one run/day.
                {week.wasGlobalCapped ? (
                  <span>
                    {' '}
                    Showing {week.shown} of {week.total} total instances.
                  </span>
                ) : null}
              </div>

              <div className="week-grid" role="grid" aria-label="Weekly cron calendar">
                {week.days.map((day) => (
                  <div key={day.key} className="week-day" role="gridcell">
                    <div className="week-day-header">
                      <div className="week-day-title">{day.heading}</div>
                      <div className="week-day-count small mono">{day.items.length}</div>
                    </div>

                    {day.items.length === 0 ? (
                      <div className="small">—</div>
                    ) : (
                      <div className="week-day-list">
                        {day.items.map((item) => {
                          const jobTz = item.scheduleTz;
                          return (
                            <div key={`${item.job.id || item.job.name}-${item.runAtMs}`} className="week-item">
                              <div className="week-item-top">
                                <div className="mono week-item-time">{formatTime(item.runAtMs)}</div>
                                {item.wasCapped ? <span className="badge idle">capped</span> : null}
                              </div>
                              <div className="week-item-title">
                                <b>{item.job.name || '—'}</b>
                              </div>
                              <div className="week-item-meta small mono">
                                {item.agentId} · {item.enabled ? 'enabled' : 'disabled'} · {item.status}
                              </div>
                              {jobTz ? (
                                <div className="week-item-meta small mono">
                                  {formatTime(item.runAtMs, jobTz)} ({jobTz})
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}
