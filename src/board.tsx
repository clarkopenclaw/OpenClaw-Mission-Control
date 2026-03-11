import { useState } from 'react';

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

function getThinking(job: CronJob): string | undefined {
  return job.thinking || job.payload?.thinking || undefined;
}

function JobCard({
  job,
  model,
  onClick,
}: {
  job: CronJob;
  model: string;
  onClick: () => void;
}) {
  const agentId = job.agentId || '(default)';
  const status = job.state?.lastRunStatus || job.state?.lastStatus || '—';
  const thinking = getThinking(job);

  return (
    <div className="board-card" onClick={onClick} role="button" tabIndex={0}>
      <div className="board-card-header">
        <b className="board-card-name">{job.name || '—'}</b>
        <span className={badgeClass(status)}>{status}</span>
      </div>
      <div className="board-card-details mono">
        <div>{agentId}</div>
        <div>{model}</div>
      </div>
      {thinking && <span className="badge board-card-thinking">thinking</span>}
      <div className="board-card-schedule mono">{formatSchedule(job.schedule)}</div>
      {job.state?.lastRunAtMs ? (
        <div className="board-card-last small">Last: {formatDateFromMs(job.state.lastRunAtMs)}</div>
      ) : null}
      {job.state?.nextRunAtMs ? (
        <div className="board-card-next small">Next: {formatDateFromMs(job.state.nextRunAtMs)}</div>
      ) : null}
    </div>
  );
}

function JobDetailModal({
  job,
  model,
  onClose,
}: {
  job: CronJob;
  model: string;
  onClose: () => void;
}) {
  const agentId = job.agentId || '(default)';
  const status = job.state?.lastRunStatus || job.state?.lastStatus || '—';
  const expr = job.schedule?.expr || job.schedule?.cron || '—';
  const tz = job.schedule?.tz || job.schedule?.timezone || '—';
  const thinking = getThinking(job);

  return (
    <div className="board-modal-backdrop" data-testid="modal-backdrop" onClick={onClose}>
      <div className="board-modal" role="dialog" aria-label={job.name || 'Job details'} onClick={(e) => e.stopPropagation()}>
        <div className="board-modal-header">
          <h3>{job.name || '—'}</h3>
          <button className="board-modal-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="board-modal-body">
          <div className="board-modal-row">
            <span className="board-modal-label">Status</span>
            <span className={badgeClass(status)}>{status}</span>
          </div>
          <div className="board-modal-row">
            <span className="board-modal-label">Enabled</span>
            <span>{job.enabled ? 'Yes' : 'No'}</span>
          </div>
          <div className="board-modal-row">
            <span className="board-modal-label">Agent</span>
            <span className="mono">{agentId}</span>
          </div>
          <div className="board-modal-row">
            <span className="board-modal-label">Model</span>
            <span className="mono">{model}</span>
          </div>
          {thinking && (
            <div className="board-modal-row">
              <span className="board-modal-label">Thinking</span>
              <span>{thinking}</span>
            </div>
          )}
          <div className="board-modal-row">
            <span className="board-modal-label">Schedule</span>
            <span className="mono">{expr}</span>
          </div>
          <div className="board-modal-row">
            <span className="board-modal-label">Timezone</span>
            <span className="mono">{tz}</span>
          </div>
          {job.state?.lastRunAtMs && (
            <div className="board-modal-row">
              <span className="board-modal-label">Last Run</span>
              <span>{formatDateFromMs(job.state.lastRunAtMs)}</span>
            </div>
          )}
          {job.state?.nextRunAtMs && (
            <div className="board-modal-row">
              <span className="board-modal-label">Next Run</span>
              <span>{formatDateFromMs(job.state.nextRunAtMs)}</span>
            </div>
          )}
        </div>
      </div>
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
  const [selectedJob, setSelectedJob] = useState<{ job: CronJob; model: string } | null>(null);

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
                return (
                  <JobCard
                    key={job.id || `${job.name || 'job'}-${idx}`}
                    job={job}
                    model={model}
                    onClick={() => setSelectedJob({ job, model })}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
      {selectedJob && (
        <JobDetailModal
          job={selectedJob.job}
          model={selectedJob.model}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </div>
  );
}
