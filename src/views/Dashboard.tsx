import { useMemo } from 'react';
import {
  CronJob, Agent,
  AGENDA_LOOKAHEAD_DAYS,
  statusClass, buildAgendaItems,
} from '../types';

type Props = {
  jobs: CronJob[];
  agents: Agent[];
};

function relativeTime(futureMs: number): string {
  const diffMs = futureMs - Date.now();
  if (diffMs < 0) return 'now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return `in ${hours}h ${remMins}m`;
  const days = Math.floor(hours / 24);
  return `in ${days}d ${hours % 24}h`;
}

export default function Dashboard({ jobs, agents }: Props) {
  const enabledJobs = useMemo(() => jobs.filter((j) => j.enabled), [jobs]);

  const upcoming = useMemo(() => {
    const nowMs = Date.now();
    return buildAgendaItems(enabledJobs, nowMs, nowMs + AGENDA_LOOKAHEAD_DAYS * 86_400_000).slice(0, 8);
  }, [enabledJobs]);

  const healthCounts = useMemo(() => {
    let ok = 0, err = 0, pending = 0;
    for (const job of enabledJobs) {
      const s = (job.state?.lastRunStatus || job.state?.lastStatus || '').toLowerCase();
      if (s.includes('ok')) ok++;
      else if (s.includes('err') || s.includes('fail')) err++;
      else pending++;
    }
    return { ok, err, pending };
  }, [enabledJobs]);

  const nextRun = upcoming[0];

  return (
    <div className="dashboard">
      <div className="dash-stats">
        <div className="dash-stat">
          <div className="dash-stat-label">Agents</div>
          <div className="dash-stat-value">{agents.length}</div>
          <div className="dash-stat-detail">
            {agents.map((a) => (
              <div key={a.id} className="small mono">{a.name || a.id}</div>
            ))}
          </div>
        </div>

        <div className="dash-stat">
          <div className="dash-stat-label">Active Jobs</div>
          <div className="dash-stat-value" style={{ color: 'var(--ok)' }}>
            {enabledJobs.length} <span className="dash-stat-sub">/ {jobs.length}</span>
          </div>
          <div className="dash-stat-detail small mono">enabled</div>
        </div>

        <div className="dash-stat">
          <div className="dash-stat-label">Health</div>
          <div className="dash-stat-value dash-health">
            {healthCounts.ok > 0 && <span className="dash-health-item ok"><span className="status-dot" />{healthCounts.ok}</span>}
            {healthCounts.err > 0 && <span className="dash-health-item err"><span className="status-dot" />{healthCounts.err}</span>}
            {healthCounts.pending > 0 && <span className="dash-health-item pending"><span className="status-dot" />{healthCounts.pending}</span>}
          </div>
          <div className="dash-stat-detail small mono">ok / err / pending</div>
        </div>

        <div className="dash-stat">
          <div className="dash-stat-label">Next Run</div>
          {nextRun ? (
            <>
              <div className="dash-stat-value" style={{ fontSize: '16px' }}>{nextRun.job.name || '--'}</div>
              <div className="dash-stat-detail small mono">{relativeTime(nextRun.runAtMs)}</div>
            </>
          ) : (
            <div className="dash-stat-value" style={{ color: 'var(--text-dim)' }}>--</div>
          )}
        </div>
      </div>

      <section className="section">
        <div className="section-header">
          <span className="section-title">Upcoming Runs</span>
          <span className="section-count">{upcoming.length} next</span>
        </div>
        <div className="dash-upcoming">
          {upcoming.length === 0 ? (
            <div className="empty-state">No upcoming runs.</div>
          ) : (
            upcoming.map((item) => (
              <div key={`${item.job.id || item.job.name}-${item.runAtMs}`} className="dash-upcoming-row">
                <span className="dash-upcoming-time mono">{relativeTime(item.runAtMs)}</span>
                <span className="dash-upcoming-name">{item.job.name || '--'}</span>
                <span className="mono small">{item.agentId}</span>
                <span className={statusClass(item.status)}>
                  <span className="status-dot" />
                  {item.status}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
