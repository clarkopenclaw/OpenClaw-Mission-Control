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

type ColumnKey = 'ok' | 'error' | 'idle' | 'disabled';

export type BoardColumn = {
  key: ColumnKey;
  label: string;
  colorClass: string;
};

export const BOARD_COLUMNS: BoardColumn[] = [
  { key: 'ok', label: 'OK', colorClass: 'board-col-ok' },
  { key: 'error', label: 'Error', colorClass: 'board-col-error' },
  { key: 'idle', label: 'Idle', colorClass: 'board-col-idle' },
  { key: 'disabled', label: 'Disabled', colorClass: 'board-col-disabled' },
];

export type ClassifiedJobs = Record<ColumnKey, CronJob[]>;

export function classifyJobsByStatus(jobs: CronJob[]): ClassifiedJobs {
  const result: ClassifiedJobs = { ok: [], error: [], idle: [], disabled: [] };

  for (const job of jobs) {
    if (!job.enabled) {
      result.disabled.push(job);
      continue;
    }

    const status = (job.state?.lastRunStatus || job.state?.lastStatus || '').toLowerCase();

    if (status.includes('ok')) {
      result.ok.push(job);
    } else if (status.includes('err') || status.includes('fail')) {
      result.error.push(job);
    } else {
      result.idle.push(job);
    }
  }

  return result;
}

function formatSchedule(schedule: CronJob['schedule']): string {
  if (!schedule) return '—';
  const expr = schedule.expr || schedule.cron || '';
  const tz = schedule.tz || schedule.timezone || '';
  if (expr) return `${expr}${tz ? ` @ ${tz}` : ''}`;
  return schedule.kind || '—';
}

function formatDateFromMs(epochMs?: number): string {
  if (!epochMs || Number.isNaN(epochMs)) return '—';
  return new Date(epochMs).toLocaleString();
}

function badgeClass(value: string): string {
  const text = value.toLowerCase();
  if (text.includes('ok')) return 'badge ok';
  if (text.includes('err') || text.includes('fail')) return 'badge err';
  if (text.includes('idle')) return 'badge idle';
  return 'badge';
}

function JobCard({
  job,
  model,
}: {
  job: CronJob;
  model: string;
}) {
  const agentId = job.agentId || '(default)';
  const status = job.state?.lastRunStatus || job.state?.lastStatus || '—';

  return (
    <div className="board-card">
      <div className="board-card-header">
        <b className="board-card-name">{job.name || '—'}</b>
        <span className={badgeClass(status)}>{status}</span>
      </div>
      <div className="board-card-details mono">
        <div>{agentId}</div>
        <div>{model}</div>
      </div>
      <div className="board-card-schedule mono">{formatSchedule(job.schedule)}</div>
      {job.state?.nextRunAtMs ? (
        <div className="board-card-next small">Next: {formatDateFromMs(job.state.nextRunAtMs)}</div>
      ) : null}
    </div>
  );
}

export function BoardView({
  jobs,
  modelByAgentId,
}: {
  jobs: CronJob[];
  modelByAgentId: Record<string, string>;
}) {
  const classified = classifyJobsByStatus(jobs);

  return (
    <div className="board">
      {BOARD_COLUMNS.map((col) => {
        const colJobs = classified[col.key];
        return (
          <div key={col.key} className={`board-column ${col.colorClass}`}>
            <div className="board-column-header">
              <span className="board-column-label">{col.label}</span>
              <span className="board-column-count">{colJobs.length}</span>
            </div>
            <div className="board-column-body">
              {colJobs.map((job, idx) => {
                const agentId = job.agentId || '(default)';
                const model = modelByAgentId[agentId] || modelByAgentId['(default)'] || '—';
                return <JobCard key={job.id || `${job.name || 'job'}-${idx}`} job={job} model={model} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
