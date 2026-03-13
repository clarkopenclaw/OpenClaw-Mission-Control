import { useMemo } from 'react';
import { CronJob, Agent, buildAgendaItems, groupAgendaByDay, AgendaGroup, AGENDA_LOOKAHEAD_DAYS } from '../types';

type Props = {
  jobs: CronJob[];
  agents: Agent[];
};

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

export default function Calendar({ jobs, agents }: Props) {
  const enabledJobs = useMemo(() => jobs.filter((j) => j.enabled), [jobs]);

  const agentColorMap = useMemo(() => {
    const colors = ['var(--accent)', 'var(--ok)', 'var(--err)', '#8b5cf6', '#3b82f6'];
    const ids = Array.from(new Set(enabledJobs.map((j) => j.agentId || '(default)')));
    const map: Record<string, string> = {};
    ids.forEach((id, i) => { map[id] = colors[i % colors.length]; });
    return map;
  }, [enabledJobs]);

  const agentNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of agents) if (a.id) map[a.id] = a.name || a.id;
    return map;
  }, [agents]);

  const { groups, todayKey, tomorrowKey } = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + AGENDA_LOOKAHEAD_DAYS);
    end.setHours(23, 59, 59, 999);

    const allItems = buildAgendaItems(enabledJobs, start.getTime(), end.getTime());
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
  }, [enabledJobs]);

  const nowMs = Date.now();
  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="cal-today">
      <div className="cal-today-header">
        <span className="cal-today-title">Calendar</span>
        <span className="mono small">{AGENDA_LOOKAHEAD_DAYS}-day view</span>
      </div>

      {totalItems === 0 ? (
        <div className="empty-state">No runs scheduled in the next {AGENDA_LOOKAHEAD_DAYS} days.</div>
      ) : (
        <div className="cal-timeline">
          {groups.map((group: AgendaGroup) => {
            const isToday = group.key === todayKey;
            const isTomorrow = group.key === tomorrowKey;
            const showRelTime = isToday || isTomorrow;

            // Find where "now" falls within today's group
            let nowIndex = -1;
            if (isToday) {
              nowIndex = group.items.findIndex((i) => i.runAtMs > nowMs);
              if (nowIndex === -1) nowIndex = group.items.length;
            }

            return (
              <div key={group.key}>
                <div className="cal-day-heading">{dayHeading(group.key, todayKey, tomorrowKey, group.heading)}</div>
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
  );
}
