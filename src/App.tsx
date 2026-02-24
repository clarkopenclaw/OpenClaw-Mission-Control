import { useEffect, useMemo, useState } from 'react';

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

export default function App() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [modelByAgentId, setModelByAgentId] = useState<Record<string, string>>({});
  const [generatedAt, setGeneratedAt] = useState<string>('Loading...');
  const [error, setError] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [enabledOnly, setEnabledOnly] = useState<boolean>(false);
  const [refreshHint, setRefreshHint] = useState<string>('');

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
              : isRecord(agentsPayload) && isRecord(agentsPayload.agentDefaults) && typeof agentsPayload.agentDefaults.model === 'string'
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
          <div className="hint">Run <code>./refresh.sh</code> to refresh <code>/data/*.json</code>.</div>
          {refreshHint ? <div className="hint">{refreshHint}</div> : null}
        </section>

        <section className="card">
          <h2>Cron jobs</h2>
          <div className="filters">
            <input
              id="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name/agent…"
            />
            <label>
              <input
                type="checkbox"
                checked={enabledOnly}
                onChange={(event) => setEnabledOnly(event.target.checked)}
              />{' '}
              Enabled only
            </label>
          </div>

          {error ? <div className="small">Failed to load jobs: {error}. Run ./refresh.sh.</div> : null}

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
        </section>
      </main>
    </>
  );
}
