import { useMemo, useState } from 'react';
import {
  CronJob, CronView,
  AGENDA_LOOKAHEAD_DAYS, MAX_AGENDA_ITEMS_TOTAL, LOCAL_TIME_ZONE,
  formatSchedule, formatDateFromMs, statusClass,
  buildAgendaItems, groupAgendaByDay, formatTime,
} from '../types';

type Props = {
  jobs: CronJob[];
  modelByAgentId: Record<string, string>;
};

export default function Jobs({ jobs, modelByAgentId }: Props) {
  const [query, setQuery] = useState('');
  const [enabledOnly, setEnabledOnly] = useState(false);
  const [cronView, setCronView] = useState<CronView>('table');

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
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startMs = startOfToday.getTime();
    const allItems = buildAgendaItems(filteredJobs, startMs, nowMs + AGENDA_LOOKAHEAD_DAYS * 86_400_000);
    for (const item of allItems) {
      item.isPast = item.runAtMs < nowMs;
    }
    const total = allItems.length;
    const shown = Math.min(total, MAX_AGENDA_ITEMS_TOTAL);
    return {
      total,
      shown,
      wasGlobalCapped: total > shown,
      groups: groupAgendaByDay(allItems.slice(0, shown)),
    };
  }, [filteredJobs]);

  const enabledCount = jobs.filter((j) => j.enabled).length;

  return (
    <section className="section">
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="section-title">Scheduled Tasks</span>
          <span className="section-count">
            {enabledCount}/{jobs.length} active
          </span>
        </div>
        <div className="segmented" role="group" aria-label="View toggle">
          <button
            type="button"
            className={cronView === 'table' ? 'seg active' : 'seg'}
            onClick={() => setCronView('table')}
          >
            Table
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
          className="filter-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name or agent..."
        />
        <label className="filter-label">
          <input type="checkbox" checked={enabledOnly} onChange={(e) => setEnabledOnly(e.target.checked)} />
          Active only
        </label>
      </div>

      {cronView === 'table' ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Agent</th>
                <th>Model</th>
                <th>Schedule</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th>Next Run</th>
                <th>Last Run</th>
                <th style={{ textAlign: 'center' }}>Last Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-state">
                    No tasks match your filter.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job, index) => {
                  const agentId = job.agentId || '(default)';
                  const model = modelByAgentId[agentId] || modelByAgentId['(default)'] || '--';
                  const status = job.state?.lastRunStatus || job.state?.lastStatus || '--';

                  return (
                    <tr key={job.id || `${job.name || 'job'}-${index}`}>
                      <td>
                        <div className="job-name">{job.name || '--'}</div>
                        <div className="job-id">{job.id || '--'}</div>
                      </td>
                      <td className="mono">{agentId}</td>
                      <td className="mono">{model}</td>
                      <td className="mono">{formatSchedule(job.schedule)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className="enabled-dot"
                          style={{ display: 'inline-block' }}
                          title={job.enabled ? 'Enabled' : 'Disabled'}
                        >
                          <span className={job.enabled ? 'enabled-dot on' : 'enabled-dot off'} />
                        </span>
                      </td>
                      <td className="mono">{formatDateFromMs(job.state?.nextRunAtMs)}</td>
                      <td className="mono">{formatDateFromMs(job.state?.lastRunAtMs)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={statusClass(status)}>
                          <span className="status-dot" />
                          {status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {cronView === 'agenda' ? (
        <div className="agenda">
          <div className="agenda-meta">
            Today + next {AGENDA_LOOKAHEAD_DAYS} days. Completed runs shown with ✓. Noisy schedules capped to 1 run/day.
            {agenda.wasGlobalCapped ? (
              <span> Showing {agenda.shown} of {agenda.total}.</span>
            ) : null}
          </div>

          {agenda.groups.length === 0 ? (
            <div className="empty-state">No upcoming runs found.</div>
          ) : (
            agenda.groups.map((group) => (
              <div key={group.key} className="agenda-day">
                <h3 className="agenda-heading">{group.heading}</h3>
                <div className="agenda-list">
                  {group.items.map((item) => {
                    const model = modelByAgentId[item.agentId] || modelByAgentId['(default)'] || '--';
                    const jobTz = item.scheduleTz || LOCAL_TIME_ZONE;

                    return (
                      <div key={`${item.job.id || item.job.name}-${item.runAtMs}`} className={`agenda-item${item.isPast ? ' agenda-past' : ''}`}>
                        <div className="agenda-time">
                          <div className="mono">{formatTime(item.runAtMs)}</div>
                          <div className="small mono">{formatTime(item.runAtMs, jobTz)} ({jobTz})</div>
                        </div>
                        <div className="agenda-body">
                          <div className="agenda-title">
                            {item.isPast ? (
                              <span className="agenda-check" title="Completed">✓</span>
                            ) : null}
                            <b>{item.job.name || '--'}</b>
                            <span className={item.enabled ? 'enabled-dot on' : 'enabled-dot off'} />
                            <span className={statusClass(item.status)}>
                              <span className="status-dot" />
                              {item.status}
                            </span>
                            {item.wasCapped ? (
                              <span className="status idle">
                                <span className="status-dot" />
                                capped
                              </span>
                            ) : null}
                          </div>
                          <div className="small mono">
                            {item.agentId} / {model} / {item.scheduleExpr}
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
    </section>
  );
}
