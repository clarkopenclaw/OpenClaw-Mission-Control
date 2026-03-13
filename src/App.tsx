import { useEffect, useRef, useState, useCallback } from 'react';
import {
  CronJob, Agent, Project,
  isRecord, loadJson, pickAgentModel, extractJobs, extractAgents, formatGeneratedAt,
} from './types';
import packageJson from '../package.json';
import Dashboard from './views/Dashboard';
import Calendar from './views/Calendar';
import Kanban from './views/Kanban';
import Jobs from './views/Jobs';
import Insights from './views/Insights';
import TaskBoard from './views/TaskBoard';
import { API_BASE } from './views/TaskBoard';
import ProjectBoard from './views/ProjectBoard';

type View = 'dashboard' | 'calendar' | 'kanban' | 'jobs' | 'insights' | 'taskboard' | 'project';

type SpeechRecognitionErrorCode =
  | 'aborted'
  | 'audio-capture'
  | 'bad-grammar'
  | 'language-not-supported'
  | 'network'
  | 'no-speech'
  | 'not-allowed'
  | 'service-not-allowed';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
}

interface SpeechRecognitionResultListLike {
  [index: number]: SpeechRecognitionResultLike;
  length: number;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: SpeechRecognitionErrorCode;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: ((event: Event) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onstart: ((event: Event) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const REFRESH_HINT_MESSAGE = 'Run ./refresh.sh in ~/Documents/mission-control, then reload.';
const OPENCLAW_URL = 'http://127.0.0.1:18789/';
const VOICE_HELP_TEXT = 'Say a view name, "next view", "sync data", "open OpenClaw", or "voice off".';

const VOICE_VIEW_PHRASES: Record<View, string[]> = {
  dashboard: ['dashboard', 'home'],
  calendar: ['calendar', 'schedule'],
  kanban: ['kanban', 'kanban board', 'pipeline'],
  jobs: ['jobs', 'job list'],
  insights: ['insights', 'analytics'],
  taskboard: ['task board', 'tasks', 'taskboard'],
  project: [],
};

function normalizeVoiceText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clipVoiceText(text: string) {
  return text.length > 54 ? `${text.slice(0, 51)}...` : text;
}

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
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectSlug, setActiveProjectSlug] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string>('Voice mode is off.');
  const [voiceError, setVoiceError] = useState<string>('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionActiveRef = useRef(false);
  const voiceEnabledRef = useRef(false);
  const generatedAtRef = useRef(generatedAt);
  const runVoiceCommandRef = useRef<(rawTranscript: string) => void>(() => {});
  const viewRef = useRef(view);
  const navIndexByView = useRef<Record<View, number>>(
    NAV_ITEMS.reduce((acc, item, index) => {
      acc[item.id] = index;
      return acc;
    }, {} as Record<View, number>),
  );

  useEffect(() => {
    generatedAtRef.current = generatedAt;
  }, [generatedAt]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const speak = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 0.96;
    window.speechSynthesis.speak(utterance);
  };

  const setViewFromVoice = (nextView: View) => {
    setView(nextView);
    setVoiceError('');
    setVoiceStatus(`Opened ${NAV_ITEMS[navIndexByView.current[nextView]].label}.`);
    speak(`${NAV_ITEMS[navIndexByView.current[nextView]].label} opened.`);
  };

  const runVoiceCommand = (rawTranscript: string) => {
    const transcript = normalizeVoiceText(rawTranscript);
    if (!transcript) return;

    setVoiceStatus(`Heard: ${clipVoiceText(rawTranscript.trim())}`);
    setVoiceError('');

    if (
      transcript.includes('voice off') ||
      transcript.includes('turn off voice') ||
      transcript.includes('disable voice') ||
      transcript.includes('stop listening')
    ) {
      setVoiceEnabled(false);
      setVoiceStatus('Voice mode is off.');
      speak('Voice mode off.');
      return;
    }

    if (transcript.includes('help') || transcript.includes('what can i say')) {
      setVoiceStatus(VOICE_HELP_TEXT);
      speak('You can say a view name, next view, sync data, open OpenClaw, or voice off.');
      return;
    }

    if (transcript.includes('sync data') || transcript.includes('refresh data') || transcript.includes('refresh dashboard')) {
      setRefreshHint(REFRESH_HINT_MESSAGE);
      setVoiceStatus('Sync instructions are on screen.');
      speak('Sync instructions are on screen.');
      return;
    }

    if (transcript.includes('open claw') || transcript.includes('openclaw')) {
      window.open(OPENCLAW_URL, '_blank', 'noopener,noreferrer');
      setVoiceStatus('Opened OpenClaw UI.');
      speak('Opening OpenClaw UI.');
      return;
    }

    if (transcript.includes('where am i') || transcript.includes('current view') || transcript.includes('status report')) {
      const label = NAV_ITEMS[navIndexByView.current[viewRef.current]].label;
      const generatedAtLabel = generatedAtRef.current === 'Loading...' ? 'Data is still loading.' : `Data snapshot: ${generatedAtRef.current}.`;
      setVoiceStatus(`${label}. ${generatedAtLabel}`);
      speak(`You are on ${label}. ${generatedAtLabel}`);
      return;
    }

    if (transcript.includes('next view') || transcript.includes('next tab')) {
      const nextIndex = (navIndexByView.current[viewRef.current] + 1) % NAV_ITEMS.length;
      setViewFromVoice(NAV_ITEMS[nextIndex].id);
      return;
    }

    if (transcript.includes('previous view') || transcript.includes('previous tab') || transcript.includes('go back')) {
      const currentIndex = navIndexByView.current[viewRef.current];
      const nextIndex = (currentIndex - 1 + NAV_ITEMS.length) % NAV_ITEMS.length;
      setViewFromVoice(NAV_ITEMS[nextIndex].id);
      return;
    }

    const matchedView = NAV_ITEMS.find((item) => VOICE_VIEW_PHRASES[item.id].some((phrase) => transcript.includes(phrase)));
    if (matchedView) {
      setViewFromVoice(matchedView.id);
      return;
    }

    setVoiceStatus(`No command matched "${clipVoiceText(rawTranscript.trim())}".`);
    speak('I did not recognize that command.');
  };

  runVoiceCommandRef.current = runVoiceCommand;

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/projects`);
      if (res.ok) setProjects(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

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
    if (typeof window === 'undefined') return;

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceSupported(false);
      setVoiceStatus('Voice mode is unavailable in this browser.');
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      recognitionActiveRef.current = true;
      setVoiceListening(true);
      setVoiceError('');
      setVoiceStatus('Listening for commands...');
    };

    recognition.onresult = (event) => {
      let transcript = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) {
          transcript += `${result[0]?.transcript ?? ''} `;
        }
      }

      if (transcript.trim()) {
        runVoiceCommandRef.current(transcript.trim());
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted' && !voiceEnabledRef.current) return;

      const nextError =
        event.error === 'audio-capture'
          ? 'No microphone is available.'
          : event.error === 'not-allowed' || event.error === 'service-not-allowed'
            ? 'Microphone access was blocked.'
            : event.error === 'language-not-supported'
              ? 'Speech recognition does not support en-US here.'
              : event.error === 'network'
                ? 'Speech recognition lost its network connection.'
                : event.error === 'no-speech'
                  ? ''
                  : 'Voice mode hit a recognition error.';

      if (nextError) {
        setVoiceError(nextError);
        setVoiceStatus(nextError);
      }

      if (
        event.error === 'audio-capture' ||
        event.error === 'language-not-supported' ||
        event.error === 'not-allowed' ||
        event.error === 'service-not-allowed'
      ) {
        voiceEnabledRef.current = false;
        setVoiceEnabled(false);
      }
    };

    recognition.onend = () => {
      recognitionActiveRef.current = false;
      setVoiceListening(false);

      if (!voiceEnabledRef.current) {
        setVoiceStatus('Voice mode is off.');
        return;
      }

      setVoiceStatus('Reconnecting voice mode...');
      window.setTimeout(() => {
        if (!voiceEnabledRef.current || recognitionActiveRef.current || recognitionRef.current !== recognition) return;

        try {
          recognition.start();
        } catch (restartError) {
          const message = restartError instanceof Error ? restartError.message : 'Voice mode could not restart.';
          setVoiceError(message);
          setVoiceStatus(message);
          voiceEnabledRef.current = false;
          setVoiceEnabled(false);
        }
      }, 250);
    };

    recognitionRef.current = recognition;
    setVoiceSupported(true);
    setVoiceStatus('Voice mode is off.');

    return () => {
      voiceEnabledRef.current = false;
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      if (recognitionActiveRef.current) {
        try {
          recognition.stop();
        } catch {
          // Some browsers throw if stop races with an internal teardown.
        }
      }
      recognitionActiveRef.current = false;
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) return;
      if (activeElement instanceof HTMLElement && activeElement.isContentEditable) return;

      const nextView = VIEW_SHORTCUTS[event.key];
      if (nextView) {
        setView(nextView);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;

    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (voiceEnabled) {
      setVoiceStatus('Starting voice mode...');
      setVoiceError('');

      if (!recognitionActiveRef.current) {
        try {
          recognition.start();
        } catch (startError) {
          const message = startError instanceof Error ? startError.message : 'Voice mode could not start.';
          setVoiceError(message);
          setVoiceStatus(message);
          voiceEnabledRef.current = false;
          setVoiceEnabled(false);
        }
      }

      speak('Voice mode on.');
      return;
    }

    setVoiceListening(false);
    setVoiceStatus(voiceSupported ? 'Voice mode is off.' : 'Voice mode is unavailable in this browser.');
    if (recognitionActiveRef.current) {
      try {
        recognition.stop();
      } catch {
        // Ignore invalid-state races when the browser has already ended capture.
      }
    }
  }, [voiceEnabled, voiceSupported]);

  const openProject = (slug: string) => {
    setActiveProjectSlug(slug);
    setView('project');
  };

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
      case 'project':
        return activeProjectSlug ? <ProjectBoard slug={activeProjectSlug} /> : <TaskBoard />;
    }
  };

  return (
    <div className="app-layout">
      <header className="header">
        <div className="header-brand">
          <div className="header-icon" title="Mission Control">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </svg>
          </div>
          <h1 title={`Mission Control v${packageJson.version}`}>Mission Control</h1>
        </div>

        <div className="header-meta">
          <div className="header-actions">
            <div className="voice-control">
              <button
                type="button"
                className={`voice-toggle${voiceEnabled ? ' active' : ''}${voiceListening ? ' listening' : ''}`}
                onClick={() => setVoiceEnabled((current) => !current)}
                aria-pressed={voiceEnabled}
                disabled={!voiceSupported}
                title={voiceSupported ? VOICE_HELP_TEXT : 'Voice mode requires browser speech recognition support.'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
                  <path d="M19 11a7 7 0 0 1-14 0" />
                  <path d="M12 18v4" />
                </svg>
                <span>{voiceEnabled ? 'Voice On' : 'Voice Off'}</span>
              </button>
              <div className={`voice-status${voiceError ? ' error' : ''}`} aria-live="polite">
                {voiceError || voiceStatus}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRefreshHint(REFRESH_HINT_MESSAGE)}
            >
              Sync Data
            </button>
            <a className="button" href={OPENCLAW_URL} target="_blank" rel="noreferrer">
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
            onClick={() => { setView(item.id); setActiveProjectSlug(null); }}
            title={item.label}
          >
            {item.icon}
            <span className="nav-btn-label">{item.label}</span>
          </button>
        ))}
        {projects.length > 0 && (
          <div className="sidebar-projects">
            <div className="sidebar-projects-label">Projects</div>
            {projects.map((p) => (
              <button
                key={p.slug}
                type="button"
                className={`sidebar-project-btn${view === 'project' && activeProjectSlug === p.slug ? ' active' : ''}`}
                onClick={() => openProject(p.slug)}
                title={p.name}
              >
                <span className="sidebar-project-dot" style={{ background: p.color }} />
                <span className="sidebar-project-name">{p.name}</span>
              </button>
            ))}
          </div>
        )}
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
