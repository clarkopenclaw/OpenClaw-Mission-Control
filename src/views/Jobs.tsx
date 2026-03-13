import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CronJob, Agent, CronView, AgendaGroup,
  AGENDA_LOOKAHEAD_DAYS, MAX_AGENDA_ITEMS_TOTAL, LOCAL_TIME_ZONE,
  formatSchedule, formatDateFromMs, statusClass,
  buildAgendaItems, groupAgendaByDay, formatTime,
} from '../types';

type Props = {
  jobs: CronJob[];
  agents: Agent[];
  modelByAgentId: Record<string, string>;
};

const VALID_TABS: CronView[] = ['table', 'agenda', 'calendar', 'board'];

// ── Calendar helpers (from Calendar.tsx) ──

function timeStr(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function relLabel(ms: number): string {
  const diff = ms - Date.now();
  if (diff < 0) return 'past';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `in ${hrs}h${rem > 0 ? ` ${rem}m` : ''}`;
}

function dayHeading(dateKeyStr: string, todayKey: string, tomorrowKey: string, headingFromGroup: string): string {
  if (dateKeyStr === todayKey) return 'Today';
  if (dateKeyStr === tomorrowKey) return 'Tomorrow';
  return headingFromGroup;
}

// ── Board helpers (from Kanban.tsx) ──

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

export default function Jobs({ jobs, agents, modelByAgentId }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') || 'table';
  const cronView: CronView = VALID_TABS.includes(tabParam as CronView) ? (tabParam as CronView) : 'table';

  const [query, enabledOnly] = useMemo(() => {
    return [searchParams.get('q') || '', false];
  }, [searchParams]);

  const setQuery = (q: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (q) next.set('q', q);
      else next.delete('q');
      return next;
    }, { replace: true });
  };

  const setCronView = (tab: CronView) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'table') next.delete('tab');
      else next.set('tab', tab);
      return next;
    }, { replace: true });
  };

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

  // ── Agenda data ──
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

  // ── Calendar data ──
  const enabledFilteredJobs = useMemo(() => filteredJobs.filter((j) => j.enabled), [filteredJobs]);

  const agentColorMap = useMemo(() => {
    const colors = ['var(--accent)', 'var(--ok)', 'var(--err)', '#8b5cf6', '#3b82f6'];
    const ids = Array.from(new Set(enabledFilteredJobs.map((j) => j.agentId || '(default)')));
    const map: Record<string, string> = {};
    ids.forEach((id, i) => { map[id] = colors[i % colors.length]; });
    return map;
  }, [enabledFilteredJobs]);

  const agentNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of agents) if (a.id) map[a.id] = a.name || a.id;
    return map;
  }, [agents]);

  const calendarData = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + AGENDA_LOOKAHEAD_DAYS);
    end.setHours(23, 59, 59, 999);

    const allItems = buildAgendaItems(enabledFilteredJobs, start.getTime(), end.getTime());
    const grouped = groupAgendaByDay(allItems);

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const fmt = (d: Date) => {
      const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
      const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      return `${byType.year}-${byType.month}-${byType.day}`;
    };

    return {
      groups: grouped,
      todayKey: fmt(todayStart),
      tomorrowKey: fmt(tomorrowStart),
    };
  }, [enabledFilteredJobs]);

  // ── Board data ──
  const columns = useMemo<Column[]>(() => {
    const active: CronJob[] = [];
    const scheduled: CronJob[] = [];
    const error: CronJob[] = [];
    const disabled: CronJob[] = [];

    for (const job of filteredJobs) {
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
  }, [filteredJobs]);

  const enabledCount = jobs.filter((j) => j.enabled).length;
  const nowMs = Date.now();

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
          <button type="button" className={cronView === 'table' ? 'seg active' : 'seg'} onClick={() => setCronView('table')}>Table</button>
          <button type="button" className={cronView === 'agenda' ? 'seg active' : 'seg'} onClick={() => setCronView('agenda')}>Agenda</button>
          <button type="button" className={cronView === 'calendar' ? 'seg active' : 'seg'} onClick={() => setCronView('calendar')}>Calendar</button>
          <button type="button" className={cronView === 'board' ? 'seg active' : 'seg'} onClick={() => setCronView('board')}>Board</button>
        </div>
      </div>

      <div className="filters">
        <input
          className="filter-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name or agent..."
        />
      </div>

      {/* ── Table tab ── */}
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

      {/* ── Agenda tab ── */}
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

      {/* ── Calendar tab ── */}
      {cronView === 'calendar' ? (
        <div className="cal-today">
          <div className="cal-today-header">
            <span className="cal-today-title">Calendar</span>
            <span className="mono small">{AGENDA_LOOKAHEAD_DAYS}-day view</span>
          </div>

          {calendarData.groups.reduce((sum, g) => sum + g.items.length, 0) === 0 ? (
            <div className="empty-state">No runs scheduled in the next {AGENDA_LOOKAHEAD_DAYS} days.</div>
          ) : (
            <div className="cal-timeline">
              {calendarData.groups.map((group: AgendaGroup) => {
                const isToday = group.key === calendarData.todayKey;
                const isTomorrow = group.key === calendarData.tomorrowKey;
                const showRelTime = isToday || isTomorrow;

                let nowIndex = -1;
                if (isToday) {
                  nowIndex = group.items.findIndex((i) => i.runAtMs > nowMs);
                  if (nowIndex === -1) nowIndex = group.items.length;
                }

                return (
                  <div key={group.key}>
                    <div className="cal-day-heading">{dayHeading(group.key, calendarData.todayKey, calendarData.tomorrowKey, group.heading)}</div>
                    {group.items.map((item, i) => {
                      const color = agentColorMap[item.agentId] || 'var(--text-dim)';
                      const isPast = item.runAtMs < nowMs;
                      const showNow = isToday && i === nowIndex;

                      return (
                        <div key={`${item.job.id || item.job.name}-${item.runAtMs}`}>
                          {showNow && (
                            <div className="cal-now-marker">
                              <span className="cal-now-dot" />
                              <span className="cal-now-label">Now</span>
                              <span className="cal-now-line" />
                            </div>
                          )}
                          <div className={`cal-run${isPast ? ' past' : ''}`}>
                            <div className="cal-run-time mono">{timeStr(item.runAtMs)}</div>
                            <div className="cal-run-bar" style={{ background: color }} />
                            <div className="cal-run-info">
                              <span className="cal-run-name">{item.job.name || '--'}</span>
                              <span className="small mono">{agentNameMap[item.agentId] || item.agentId}</span>
                            </div>
                            {!isPast && showRelTime && <span className="cal-run-rel mono small">{relLabel(item.runAtMs)}</span>}
                          </div>
                        </div>
                      );
                    })}
                    {isToday && nowIndex === group.items.length && (
                      <div className="cal-now-marker">
                        <span className="cal-now-dot" />
                        <span className="cal-now-label">Now</span>
                        <span className="cal-now-line" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* ── Board tab ── */}
      {cronView === 'board' ? (
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
      ) : null}
    </section>
  );
}
