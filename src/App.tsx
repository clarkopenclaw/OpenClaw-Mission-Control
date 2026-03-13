import { useEffect, useState } from 'react';
import {
  CronJob, Agent,
  isRecord, loadJson, pickAgentModel, extractJobs, extractAgents, formatGeneratedAt,
} from './types';
import Dashboard from './views/Dashboard';
import Calendar from './views/Calendar';
import Kanban from './views/Kanban';
import Jobs from './views/Jobs';
import Insights from './views/Insights';
import TaskBoard from './views/TaskBoard';

type View = 'dashboard' | 'calendar' | 'kanban' | 'jobs' | 'insights' | 'taskboard';

const NAV_ITEMS: { id: View; label: string; icon: JSX.Element }[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    id: 'kanban',
    label: 'Kanban',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="5" height="18" rx="1" />
        <rect x="10" y="3" width="5" height="12" rx="1" />
        <rect x="17" y="3" width="5" height="15" rx="1" />
      </svg>
    ),
  },
  {
    id: 'jobs',
    label: 'Jobs',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
      </svg>
    ),
  },
  {
    id: 'taskboard',
    label: 'Task Board',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
];

const VIEW_SHORTCUTS: Record<string, View> = {
  '1': 'dashboard',
  '2': 'calendar',
  '3': 'kanban',
  '4': 'jobs',
  '5': 'insights',
  '6': 'taskboard',
};

export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [modelByAgentId, setModelByAgentId] = useState<Record<string, string>>({});
  const [generatedAt, setGeneratedAt] = useState<string>('Loading...');
  const [error, setError] = useState<string>('');
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
        setGeneratedAt('No data');
      }

      if (agentsResult.status === 'fulfilled') {
        const agentsPayload = agentsResult.value;
        const agentsList = extractAgents(agentsPayload);
        setAgents(agentsList);

        const nextModelByAgentId: Record<string, string> = {};
        for (const agent of agentsList) {
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

        if (defaultModel) nextModelByAgentId['(default)'] = defaultModel;
        setModelByAgentId(nextModelByAgentId);
      } else {
        setAgents([]);
        setModelByAgentId({});
      }

      if (jobsResult.status === 'fulfilled') {
        setJobs(extractJobs(jobsResult.value));
      } else {
        setJobs([]);
        setError(jobsResult.reason instanceof Error ? jobsResult.reason.message : 'Failed to load cron-jobs.json');
      }
    })();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
        return;
      }

      const nextView = VIEW_SHORTCUTS[event.key];
      if (nextView) {
        setView(nextView);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return <Dashboard jobs={jobs} agents={agents} />;
      case 'calendar':
        return <Calendar jobs={jobs} agents={agents} />;
      case 'kanban':
        return <Kanban jobs={jobs} />;
      case 'jobs':
        return <Jobs jobs={jobs} modelByAgentId={modelByAgentId} />;
      case 'insights':
        return <Insights jobs={jobs} />;
      case 'taskboard':
        return <TaskBoard />;
    }
  };

  return (
    <div className="app-layout">
      <header className="header">
        <div className="header-brand">
          <div className="header-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </svg>
          </div>
          <h1>Mission Control</h1>
        </div>

        <div className="header-meta">
          <div className="header-actions">
            <button
              type="button"
              onClick={() => setRefreshHint('Run ./refresh.sh in ~/Documents/mission-control, then reload.')}
            >
              Sync Data
            </button>
            <a className="button" href="http://127.0.0.1:18789/" target="_blank" rel="noreferrer">
              OpenClaw UI
            </a>
          </div>
        </div>
      </header>

      <nav className="sidebar">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-btn${view === item.id ? ' active' : ''}`}
            onClick={() => setView(item.id)}
            title={item.label}
          >
            {item.icon}
          </button>
        ))}
        <div className="sidebar-spacer" />
        <div className="sync-pill sidebar-sync">
          <span className="sync-dot" />
          {generatedAt}
        </div>
      </nav>

      <main className="content">
        {refreshHint ? <div className="refresh-hint">{refreshHint}</div> : null}
        {error ? <div className="error-bar">{error}. Run ./refresh.sh.</div> : null}
        {renderView()}
      </main>
    </div>
  );
}
