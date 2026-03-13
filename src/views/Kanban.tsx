import { useMemo } from 'react';
import { CronJob, formatSchedule, statusClass, formatDateFromMs } from '../types';

type Props = {
  jobs: CronJob[];
};

type Column = {
  id: string;
  label: string;
  colorVar: string;
  jobs: CronJob[];
};

function deriveStatus(job: CronJob): string {
  const s = (job.state?.lastRunStatus || job.state?.lastStatus || '').toLowerCase();
  if (!job.enabled) return 'disabled';
  if (s.includes('err') || s.includes('fail')) return 'error';
  if (s.includes('ok')) return 'active';
  return 'scheduled';
}

export default function Kanban({ jobs }: Props) {
  const columns = useMemo<Column[]>(() => {
    const active: CronJob[] = [];
    const scheduled: CronJob[] = [];
    const error: CronJob[] = [];
    const disabled: CronJob[] = [];

    for (const job of jobs) {
      switch (deriveStatus(job)) {
        case 'active': active.push(job); break;
        case 'scheduled': scheduled.push(job); break;
        case 'error': error.push(job); break;
        case 'disabled': disabled.push(job); break;
      }
    }

    return [
      { id: 'active', label: 'Active', colorVar: 'var(--ok)', jobs: active },
      { id: 'scheduled', label: 'Scheduled', colorVar: 'var(--accent)', jobs: scheduled },
      { id: 'error', label: 'Error', colorVar: 'var(--err)', jobs: error },
      { id: 'disabled', label: 'Disabled', colorVar: 'var(--text-dim)', jobs: disabled },
    ];
  }, [jobs]);

  return (
    <div className="kanban">
      {columns.map((col) => (
        <div key={col.id} className="kanban-col">
          <div className="kanban-col-header" style={{ borderColor: col.colorVar }}>
            <span style={{ color: col.colorVar }}>{col.label}</span>
            <span className="kanban-col-count">{col.jobs.length}</span>
          </div>
          <div className="kanban-col-body">
            {col.jobs.map((job, idx) => {
              const agentId = job.agentId || '(default)';
              const status = job.state?.lastRunStatus || job.state?.lastStatus || '--';
              return (
                <div key={job.id || `${job.name || 'job'}-${idx}`} className="kanban-card">
                  <div className="kanban-card-name">{job.name || '--'}</div>
                  <div className="small mono">{agentId}</div>
                  <div className="small mono" style={{ color: 'var(--text-dim)' }}>{formatSchedule(job.schedule)}</div>
                  <div className="kanban-card-footer">
                    {job.state?.nextRunAtMs ? (
                      <span className="small mono">{formatDateFromMs(job.state.nextRunAtMs)}</span>
                    ) : null}
                    <span className={statusClass(status)}>
                      <span className="status-dot" />
                      {status}
                    </span>
                  </div>
                </div>
              );
            })}
            {col.jobs.length === 0 && (
              <div className="empty-state" style={{ padding: '24px 8px' }}>None</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
