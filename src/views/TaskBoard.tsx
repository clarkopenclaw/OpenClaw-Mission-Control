import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Markdown from 'react-markdown';
import { Task, TaskStatus, TaskType, TaskPriority, TaskEvents, TaskArtifact, Project, TASK_COLUMNS, PHASE_ORDER, priorityColor, taskTypeLabel } from '../types';

export const API_BASE = '/api';
const POLL_INTERVAL = 5000;

export default function TaskBoard({ projectSlug }: { projectSlug?: string } = {}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);

  const activeProject = projectSlug
    ? projects.find((p) => p.slug === projectSlug) ?? null
    : null;

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/projects`);
      if (res.ok) setProjects(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/tasks`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Task[] = await res.json();
      setTasks(data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch tasks');
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
    void fetchProjects();
    const id = setInterval(() => void fetchTasks(), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchTasks, fetchProjects]);

  const columns = useMemo(() => {
    const effectiveFilter = projectSlug ?? projectFilter;
    const filtered = effectiveFilter
      ? tasks.filter((t) => t.project === effectiveFilter)
      : tasks;
    return TASK_COLUMNS.map((col) => ({
      ...col,
      tasks: filtered.filter((t) => {
        if (col.id === 'in_progress') return t.status === 'in_progress' || t.status === 'supervising';
        return t.status === col.id;
      }),
    }));
  }, [tasks, projectSlug, projectFilter]);

  const handleAction = async (taskId: string, action: string) => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    }
  };

  const handleCreate = async (data: {
    title: string;
    type: TaskType;
    priority: TaskPriority;
    body: string;
    repo: string;
    base_branch: string;
    depends_on?: string[];
    project?: string;
  }) => {
    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowCreate(false);
      await fetchTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  };

  const handleMove = async (taskId: string, newStatus: TaskStatus) => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Move failed');
    }
  };

  const handleUpdate = async (taskId: string, updates: Partial<Task>) => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (selectedTaskId === taskId) setSelectedTaskId(null);
      await fetchTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="task-board">
      {activeProject && (
        <div className="project-board-header">
          <span className="project-board-dot" style={{ background: activeProject.color }} />
          <h2 className="project-board-name">{activeProject.name}</h2>
          {activeProject.repo && (
            <span className="project-board-repo mono small">{activeProject.repo}</span>
          )}
        </div>
      )}
      <div className="task-board-toolbar">
        <button type="button" className="task-btn task-btn-create" onClick={() => setShowCreate(true)}>
          + New Task
        </button>
      </div>
      {!projectSlug && projects.length > 0 && (
        <div className="project-filter-bar">
          <button
            type="button"
            className={`project-filter-chip${projectFilter === null ? ' active' : ''}`}
            onClick={() => setProjectFilter(null)}
          >
            All
          </button>
          {projects.map((p) => (
            <button
              key={p.slug}
              type="button"
              className={`project-filter-chip${projectFilter === p.slug ? ' active' : ''}`}
              onClick={() => setProjectFilter(projectFilter === p.slug ? null : p.slug)}
            >
              <span className="task-project-dot" style={{ background: p.color }} />
              {p.name}
            </button>
          ))}
        </div>
      )}
      {showCreate && (
        <CreateTaskForm
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          existingTasks={tasks}
          projects={projects}
          onProjectCreated={fetchProjects}
          defaultProject={projectSlug}
        />
      )}
      {error && <div className="error-bar">{error}</div>}
      <div className="task-board-columns">
        {columns.map((col) => (
          <div key={col.id} className="kanban-col">
            <div className="kanban-col-header" style={{ borderColor: col.colorVar }}>
              <span style={{ color: col.colorVar }}>{col.label}</span>
              <span className="kanban-col-count">{col.tasks.length}</span>
            </div>
            <div className="kanban-col-body">
              {col.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onAction={handleAction}
                  onMove={handleMove}
                  onClick={(id) => setSelectedTaskId(id)}
                  projects={projects}
                />
              ))}
              {col.tasks.length === 0 && (
                <div className="empty-state" style={{ padding: '24px 8px' }}>None</div>
              )}
            </div>
          </div>
        ))}
      </div>
      {selectedTaskId && (() => {
        const selectedTask = tasks.find(t => t.id === selectedTaskId);
        if (!selectedTask) return null;
        return (
          <TaskDetailPanel
            task={selectedTask}
            tasks={tasks}
            onClose={() => setSelectedTaskId(null)}
            onAction={handleAction}
            onMove={handleMove}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        );
      })()}
    </div>
  );
}

function CreateTaskForm({
  onSubmit,
  onCancel,
  existingTasks,
  projects,
  onProjectCreated,
  defaultProject,
}: {
  onSubmit: (data: {
    title: string;
    type: TaskType;
    priority: TaskPriority;
    body: string;
    repo: string;
    base_branch: string;
    depends_on?: string[];
    project?: string;
  }) => void;
  onCancel: () => void;
  existingTasks: Task[];
  projects: Project[];
  onProjectCreated: () => void;
  defaultProject?: string;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('coding');
  const [priority, setPriority] = useState<TaskPriority>('P1');
  const [body, setBody] = useState('');
  const defaultProj = defaultProject ? projects.find((p) => p.slug === defaultProject) : undefined;
  const [repo, setRepo] = useState(defaultProj?.repo || '~/Documents/mission-control');
  const [baseBranch, setBaseBranch] = useState('main');
  const [selectedDeps, setSelectedDeps] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState(defaultProject || '');
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectSlug, setNewProjectSlug] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectRepo, setNewProjectRepo] = useState('');
  const [newProjectColor, setNewProjectColor] = useState('#f0b429');

  const nonDoneTasks = existingTasks.filter(t => t.status !== 'done');

  const handleProjectChange = (value: string) => {
    if (value === '__new__') {
      setShowNewProject(true);
      setSelectedProject('');
    } else if (value === '__manual__') {
      setShowNewProject(false);
      setSelectedProject('');
    } else {
      setShowNewProject(false);
      setSelectedProject(value);
      const proj = projects.find(p => p.slug === value);
      if (proj?.repo) setRepo(proj.repo);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectSlug.trim() || !newProjectName.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: newProjectSlug, name: newProjectName, repo: newProjectRepo, color: newProjectColor }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelectedProject(newProjectSlug);
      if (newProjectRepo) setRepo(newProjectRepo);
      setShowNewProject(false);
      onProjectCreated();
    } catch { /* ignore */ }
  };

  return (
    <div className="create-task-overlay">
      <div className="create-task-form">
        <h3>New Task</h3>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" />
        </label>
        <div className="create-task-row">
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as TaskType)}>
              <option value="coding">Coding</option>
              <option value="research">Research</option>
              <option value="outbound">Outbound</option>
              <option value="ops">Ops</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          <label>
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              <option value="P0">P0 - Critical</option>
              <option value="P1">P1 - High</option>
              <option value="P2">P2 - Medium</option>
              <option value="P3">P3 - Low</option>
            </select>
          </label>
        </div>
        <label>
          Project
          <select value={selectedProject || (showNewProject ? '__new__' : '__manual__')} onChange={(e) => handleProjectChange(e.target.value)}>
            <option value="__manual__">Other (manual repo)</option>
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
            <option value="__new__">+ New Project</option>
          </select>
        </label>
        {showNewProject && (
          <div className="create-task-inline-project">
            <div className="create-task-row">
              <label>
                Slug
                <input value={newProjectSlug} onChange={(e) => setNewProjectSlug(e.target.value)} placeholder="my-project" />
              </label>
              <label>
                Name
                <input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="My Project" />
              </label>
            </div>
            <div className="create-task-row">
              <label>
                Repo Path
                <input value={newProjectRepo} onChange={(e) => setNewProjectRepo(e.target.value)} placeholder="~/Documents/my-project" />
              </label>
              <label>
                Color
                <div className="create-task-color-picker">
                  <input type="color" value={newProjectColor} onChange={(e) => setNewProjectColor(e.target.value)} />
                  <span className="small mono">{newProjectColor}</span>
                </div>
              </label>
            </div>
            <button
              type="button"
              className="task-btn task-btn-approve"
              disabled={!newProjectSlug.trim() || !newProjectName.trim()}
              onClick={handleCreateProject}
            >
              Create Project
            </button>
          </div>
        )}
        {type === 'coding' && (
          <div className="create-task-row">
            <label>
              Repo
              <input value={repo} onChange={(e) => setRepo(e.target.value)} />
            </label>
            <label>
              Base Branch
              <input value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} />
            </label>
          </div>
        )}
        <label>
          Description
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Context and instructions for the agent..."
          />
        </label>
        {nonDoneTasks.length > 0 && (
          <DependencyPicker
            label="Dependencies (optional)"
            tasks={nonDoneTasks}
            selected={selectedDeps}
            onChange={setSelectedDeps}
          />
        )}
        <div className="create-task-actions">
          <button type="button" className="task-btn" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="task-btn task-btn-approve"
            disabled={!title.trim()}
            onClick={() => onSubmit({
              title, type, priority, body,
              repo: type === 'coding' ? repo : '',
              base_branch: type === 'coding' ? baseBranch : '',
              ...(selectedDeps.length > 0 ? { depends_on: selectedDeps } : {}),
              ...(selectedProject ? { project: selectedProject } : {}),
            })}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function DependencyPicker({
  label,
  tasks,
  selected,
  onChange,
}: {
  label?: string;
  tasks: Task[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(d => d !== id) : [...selected, id]);
  };

  return (
    <div className="dep-picker" ref={ref}>
      {label && <label className="dep-picker-label">{label}</label>}
      <button type="button" className="dep-picker-trigger" onClick={() => setOpen(!open)}>
        {selected.length === 0
          ? 'Select dependencies...'
          : `${selected.length} task${selected.length > 1 ? 's' : ''} selected`}
        <span className="dep-picker-arrow">{open ? '\u25b4' : '\u25be'}</span>
      </button>
      {selected.length > 0 && (
        <div className="dep-picker-tags">
          {selected.map((id) => {
            const t = tasks.find(x => x.id === id);
            return (
              <span key={id} className="dep-picker-tag">
                {t ? t.title : id}
                <button type="button" className="dep-picker-tag-remove" onClick={() => toggle(id)}>&times;</button>
              </span>
            );
          })}
        </div>
      )}
      {open && (
        <div className="dep-picker-dropdown">
          {tasks.length === 0 && (
            <div className="dep-picker-empty">No available tasks</div>
          )}
          {tasks.map((t) => (
            <div
              key={t.id}
              className={`dep-picker-option${selected.includes(t.id) ? ' selected' : ''}`}
              onClick={() => toggle(t.id)}
            >
              <span className={`dep-picker-check${selected.includes(t.id) ? ' on' : ''}`}>
                {selected.includes(t.id) ? '\u2713' : ''}
              </span>
              <span className="task-dep-item-id">{t.id}</span>
              <span className="dep-picker-option-title">{t.title}</span>
              <span className={`task-dep-item-status ${t.status === 'done' ? 'done' : 'unmet'}`}>
                {t.status.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  onAction,
  onMove,
  onClick,
  projects,
}: {
  task: Task;
  onAction: (id: string, action: string) => void;
  onMove: (id: string, status: TaskStatus) => void;
  onClick: (id: string) => void;
  projects: Project[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<TaskEvents | null>(null);

  const elapsed = task.agent_started_at
    ? Math.round((Date.now() - new Date(task.agent_started_at).getTime()) / 60000)
    : null;

  useEffect(() => {
    if (!expanded) return;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/tasks/${task.id}/events`);
        if (res.ok) setEvents(await res.json());
      } catch { /* ignore fetch errors */ }
    };
    void load();
    if (task.status === 'in_progress') {
      const id = setInterval(load, 5000);
      return () => clearInterval(id);
    }
  }, [expanded, task.id, task.status]);

  return (
    <div className="kanban-card task-card" onClick={() => onClick(task.id)} style={{ cursor: 'pointer' }}>
      <div className="task-card-header">
        <span className="kanban-card-name">{task.title}</span>
        <span
          className="task-priority-badge"
          style={{ color: priorityColor(task.priority), borderColor: priorityColor(task.priority) }}
        >
          {task.priority}
        </span>
      </div>

      <div className="task-card-meta">
        <span className="small mono">{taskTypeLabel(task.type)}</span>
        {task.review_type && (
          <span className="small mono" style={{ color: 'var(--text-dim)' }}>
            {task.review_type.toUpperCase()}
          </span>
        )}
        {task.agent_active && (
          <span className="small mono" style={{ color: 'var(--ok)' }}>
            {task.agent_active}
          </span>
        )}
        {(task.depends_on?.length ?? 0) > 0 && (
          <span className="task-dep-indicator">&#x1f517;{task.depends_on!.length}</span>
        )}
        {task.project && (() => {
          const proj = projects.find(p => p.slug === task.project);
          return (
            <span className="task-project-badge" style={{
              background: proj ? `${proj.color}22` : 'var(--accent-dim)',
              color: proj?.color || 'var(--accent)',
              border: `1px solid ${proj ? `${proj.color}55` : 'rgba(240,180,41,0.3)'}`,
            }}>
              {proj?.name || task.project}
            </span>
          );
        })()}
      </div>

      {task.status === 'supervising' && (
        <div className="small mono" style={{ color: '#fbbf24', marginTop: 4 }}>
          Awaiting review &middot; {task.supervisor_data?.step?.replace(/-/g, ' ') || 'supervising'}
        </div>
      )}

      {task.status === 'in_progress' && elapsed !== null && (
        <div className="task-card-progress">
          <span className="small mono" style={{ color: 'var(--text-dim)' }}>
            {elapsed}m elapsed
          </span>
        </div>
      )}

      {task.status === 'blocked' && task.blocked_reason && (
        <div className="task-card-blocked small" style={{ color: 'var(--err)' }}>
          {task.blocked_reason}
        </div>
      )}

      {task.pr_url && (
        <a
          href={task.pr_url}
          target="_blank"
          rel="noreferrer"
          className="small mono"
          style={{ color: 'var(--ok)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {task.pr_url.replace(/.*\/pull\//, 'PR #')}
        </a>
      )}

      <div className="task-card-actions">
        {task.status === 'backlog' && (
          <button type="button" className="task-btn" onClick={(e) => { e.stopPropagation(); onMove(task.id, 'todo'); }}>
            Promote
          </button>
        )}
        {task.status === 'human_review' && (
          <>
            <button
              type="button"
              className="task-btn task-btn-approve"
              onClick={(e) => { e.stopPropagation(); onAction(task.id, 'approve'); }}
            >
              Approve
            </button>
            <button
              type="button"
              className="task-btn task-btn-reject"
              onClick={(e) => { e.stopPropagation(); onAction(task.id, 'reject'); }}
            >
              Reject
            </button>
          </>
        )}
        {task.status === 'blocked' && (
          <button type="button" className="task-btn" onClick={(e) => { e.stopPropagation(); onAction(task.id, 'unblock'); }}>
            Unblock
          </button>
        )}
      </div>

      <button
        type="button"
        className="task-debug-toggle small mono"
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
      >
        {expanded ? '\u25be Debug' : '\u25b8 Debug'}
      </button>

      {expanded && events && (
        <div className="task-debug-panel">
          <div className="task-debug-row">
            <span className="task-debug-label">Phase</span>
            <span className="task-debug-value" data-phase={events.phase}>
              {events.phase}
            </span>
          </div>
          {events.branch && (
            <div className="task-debug-row">
              <span className="task-debug-label">Branch</span>
              <span className="task-debug-value">{events.branch}</span>
            </div>
          )}
          {events.gate_passed !== null && (
            <div className="task-debug-row">
              <span className="task-debug-label">Gate</span>
              <span className="task-debug-value" style={{
                color: events.gate_passed ? 'var(--ok)' : 'var(--err)'
              }}>
                {events.gate_passed ? 'PASSED' : 'FAILED'}
              </span>
            </div>
          )}
          {events.error && (
            <div className="task-debug-row" style={{ color: 'var(--err)' }}>
              {events.error}
            </div>
          )}
          {events.log_tail.length > 0 && (
            <div className="task-debug-log">
              {events.log_tail.map((line, i) => (
                <div key={i} className="task-debug-log-line">{line}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MediaArtifactRenderer({ artifact, onImageClick }: { artifact: TaskArtifact; onImageClick?: (url: string) => void }) {
  const artType = artifact.type || 'text';

  if (artType === 'image' && artifact.url) {
    return (
      <div className="artifact-media artifact-image">
        <img
          src={artifact.thumbnail_url || artifact.url}
          alt={artifact.title}
          onClick={() => onImageClick?.(artifact.url!)}
          style={{ cursor: 'pointer', maxWidth: '100%', borderRadius: 4 }}
        />
        {artifact.content && (
          <p className="artifact-caption">{artifact.content}</p>
        )}
        {artifact.slack_ts && (
          <span className="artifact-slack-badge" title="Posted to Slack">Slack</span>
        )}
      </div>
    );
  }

  if (artType === 'video' && artifact.url) {
    return (
      <div className="artifact-media artifact-video">
        <video
          controls
          poster={artifact.thumbnail_url}
          style={{ maxWidth: '100%', borderRadius: 4 }}
        >
          <source src={artifact.url} type={artifact.mime_type || 'video/mp4'} />
        </video>
        {artifact.content && (
          <p className="artifact-caption">{artifact.content}</p>
        )}
        {artifact.slack_ts && (
          <span className="artifact-slack-badge" title="Posted to Slack">Slack</span>
        )}
      </div>
    );
  }

  if (artType === 'link' && artifact.url) {
    return (
      <div className="artifact-media artifact-link-card">
        <a href={artifact.url} target="_blank" rel="noreferrer">
          {artifact.title}
        </a>
        {artifact.content && (
          <p className="artifact-caption">{artifact.content}</p>
        )}
      </div>
    );
  }

  // Default: text / markdown
  return (
    <div className="task-artifact-content">
      <Markdown>{artifact.content}</Markdown>
    </div>
  );
}

function ArtifactSection({ artifacts, onImageClick }: { artifacts: TaskArtifact[]; onImageClick?: (url: string) => void }) {
  // Group by phase, then sort within each group by created_at
  const grouped = useMemo(() => {
    const byPhase = new Map<string, TaskArtifact[]>();
    for (const a of artifacts) {
      const phase = a.phase || 'untagged';
      const list = byPhase.get(phase) || [];
      list.push(a);
      byPhase.set(phase, list);
    }
    // Sort phases by PHASE_ORDER
    const sorted = [...byPhase.entries()].sort(([a], [b]) => {
      const ai = PHASE_ORDER.indexOf(a as TaskStatus);
      const bi = PHASE_ORDER.indexOf(b as TaskStatus);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    // Sort artifacts within each phase by created_at desc
    for (const [, list] of sorted) {
      list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return sorted;
  }, [artifacts]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['0-0']));
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());

  const toggleArtifact = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const togglePhase = (phase: string) => {
    setCollapsedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  };

  const hasMultiplePhases = grouped.length > 1;

  return (
    <>
      <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-dim)' }}>Artifacts</h4>
      {/* Phase timeline dots */}
      {hasMultiplePhases && (
        <div className="artifact-phase-timeline">
          {grouped.map(([phase]) => {
            const col = TASK_COLUMNS.find(c => c.id === phase);
            return (
              <div key={phase} className="artifact-phase-dot" style={{ '--dot-color': col?.colorVar || 'var(--text-dim)' } as React.CSSProperties}>
                <span className="artifact-phase-dot-circle" />
                <span className="artifact-phase-dot-label">{phase.replace(/_/g, ' ')}</span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {grouped.map(([phase, list], gi) => (
          <div key={phase}>
            {hasMultiplePhases && (
              <button
                type="button"
                className="artifact-phase-header"
                onClick={() => togglePhase(phase)}
              >
                <span>
                  {collapsedPhases.has(phase) ? '\u25b8' : '\u25be'}{' '}
                  {phase.replace(/_/g, ' ')}
                </span>
                <span className="small mono" style={{ color: 'var(--text-dim)' }}>
                  {list.length} artifact{list.length !== 1 ? 's' : ''}
                </span>
              </button>
            )}
            {!collapsedPhases.has(phase) && list.map((a, i) => {
              const key = `${gi}-${i}`;
              const artType = a.type || 'text';
              const isMedia = artType === 'image' || artType === 'video';
              return (
                <div key={key} style={{ marginBottom: 4 }}>
                  <button
                    type="button"
                    className="task-artifact-header"
                    style={expanded.has(key) ? { borderRadius: '6px 6px 0 0' } : undefined}
                    onClick={() => toggleArtifact(key)}
                  >
                    <span>
                      {expanded.has(key) ? '\u25be' : '\u25b8'}{' '}
                      {isMedia && <span className="artifact-type-icon">{artType === 'image' ? '\ud83d\uddbc' : '\ud83c\udfac'}</span>}
                      {a.title}
                    </span>
                    <span className="small mono" style={{ color: 'var(--text-dim)' }}>
                      {a.kind}{a.source ? ` \u00b7 ${a.source}` : ''} &middot; {new Date(a.created_at).toLocaleString()}
                    </span>
                  </button>
                  {expanded.has(key) && (
                    <MediaArtifactRenderer artifact={a} onImageClick={onImageClick} />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

function SlackThreadLink({ task }: { task: Task }) {
  if (!task.slack_thread_url) return null;
  return (
    <div className="slack-thread-link">
      <a href={task.slack_thread_url} target="_blank" rel="noreferrer">
        Slack Thread
      </a>
      {task.last_notified_phase && (
        <span className="slack-last-phase-badge">
          {task.last_notified_phase.replace(/_/g, ' ')}
        </span>
      )}
    </div>
  );
}

function TaskDetailPanel({
  task,
  tasks,
  onClose,
  onAction,
  onMove,
  onUpdate,
  onDelete,
}: {
  task: Task;
  tasks: Task[];
  onClose: () => void;
  onAction: (id: string, action: string) => void;
  onMove: (id: string, status: TaskStatus) => void;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onDelete: (id: string) => void;
}) {
  const [events, setEvents] = useState<TaskEvents | null>(null);
  const [editingBody, setEditingBody] = useState(false);
  const [bodyDraft, setBodyDraft] = useState(task.body || '');
  const [editingDeps, setEditingDeps] = useState(false);
  const [depsDraft, setDepsDraft] = useState<string[]>(task.depends_on || []);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Reset drafts when task changes
  useEffect(() => {
    setBodyDraft(task.body || '');
    setEditingBody(false);
    setDepsDraft(task.depends_on || []);
    setEditingDeps(false);
  }, [task.id, task.body, task.depends_on]);

  // Fetch events on mount, poll if in_progress
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/tasks/${task.id}/events`);
        if (res.ok) setEvents(await res.json());
      } catch { /* ignore */ }
    };
    void load();
    if (task.status === 'in_progress') {
      const id = setInterval(load, 5000);
      return () => clearInterval(id);
    }
  }, [task.id, task.status]);

  const elapsed = task.agent_started_at
    ? Math.round((Date.now() - new Date(task.agent_started_at).getTime()) / 60000)
    : null;

  const blockers = tasks.filter(t => t.depends_on?.includes(task.id));

  return (
    <div
      className="task-detail-overlay"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        className="task-detail-panel"
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: 500,
          overflowY: 'auto',
          background: 'var(--surface, #1a1a2e)',
          borderLeft: '1px solid var(--border, #333)',
          padding: '24px',
          zIndex: 1001,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="task-detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 className="task-detail-title" style={{ margin: '0 0 8px 0' }}>{task.title}</h2>
            <div className="task-detail-badges" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="task-priority-badge" style={{ color: priorityColor(task.priority), borderColor: priorityColor(task.priority) }}>
                {task.priority}
              </span>
              <span className="task-status-pill" data-status={task.status}>
                {task.status.replace(/_/g, ' ')}
              </span>
              {task.project && (
                <span className="task-project-badge" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(240,180,41,0.3)' }}>
                  {task.project}
                </span>
              )}
            </div>
          </div>
          <button type="button" className="task-detail-close" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: 24, cursor: 'pointer' }}>&times;</button>
        </div>

        {/* Metadata grid */}
        <div className="task-detail-meta" style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 12px', marginBottom: 16, fontSize: 13 }}>
          <span style={{ color: 'var(--text-dim)' }}>ID</span>
          <span className="mono">{task.id}</span>
          <span style={{ color: 'var(--text-dim)' }}>Type</span>
          <span>{taskTypeLabel(task.type)}</span>
          <span style={{ color: 'var(--text-dim)' }}>Review Type</span>
          <span>{task.review_type ? task.review_type.toUpperCase() : '--'}</span>
          <span style={{ color: 'var(--text-dim)' }}>Created By</span>
          <span>{task.created_by}</span>
          <span style={{ color: 'var(--text-dim)' }}>Created At</span>
          <span>{new Date(task.created_at).toLocaleString()}</span>
          <span style={{ color: 'var(--text-dim)' }}>Updated At</span>
          <span>{new Date(task.updated_at).toLocaleString()}</span>
        </div>

        {/* Repo/Branch section */}
        {task.repo && (
          <div style={{ marginBottom: 16, fontSize: 13 }}>
            <div className="task-detail-meta" style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 12px' }}>
              <span style={{ color: 'var(--text-dim)' }}>Repo</span>
              <span className="mono">{task.repo}</span>
              {task.branch && (
                <>
                  <span style={{ color: 'var(--text-dim)' }}>Branch</span>
                  <span className="mono">{task.branch}</span>
                </>
              )}
              {task.base_branch && (
                <>
                  <span style={{ color: 'var(--text-dim)' }}>Base Branch</span>
                  <span className="mono">{task.base_branch}</span>
                </>
              )}
              {task.pr_url && (
                <>
                  <span style={{ color: 'var(--text-dim)' }}>PR</span>
                  <a href={task.pr_url} target="_blank" rel="noreferrer" style={{ color: 'var(--ok)' }}>
                    {task.pr_url.replace(/.*\/pull\//, 'PR #')}
                  </a>
                </>
              )}
            </div>
          </div>
        )}

        {/* Agent section */}
        {task.agent_chain?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13, color: 'var(--text-dim)' }}>Agent Chain</h4>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {task.agent_chain.map((agent) => (
                <span
                  key={agent}
                  className="mono small"
                  style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: agent === task.agent_active ? 'var(--ok)' : 'var(--surface-alt, #2a2a3e)',
                    color: agent === task.agent_active ? '#000' : 'var(--text)',
                    border: '1px solid ' + (agent === task.agent_active ? 'var(--ok)' : 'var(--border, #333)'),
                  }}
                >
                  {agent}
                </span>
              ))}
            </div>
            {elapsed !== null && (
              <span className="small mono" style={{ color: 'var(--text-dim)' }}>
                {elapsed}m elapsed
              </span>
            )}
            <span className="small mono" style={{ color: 'var(--text-dim)', marginLeft: 12 }}>
              Attempt {task.attempt}/{task.max_attempts}
            </span>
          </div>
        )}

        {/* Description section */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <h4 style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)' }}>Description</h4>
            {!editingBody && (
              <button
                type="button"
                className="task-btn small"
                style={{ fontSize: 11, padding: '1px 6px' }}
                onClick={() => { setBodyDraft(task.body || ''); setEditingBody(true); }}
              >
                Edit
              </button>
            )}
          </div>
          {editingBody ? (
            <div>
              <textarea
                value={bodyDraft}
                onChange={(e) => setBodyDraft(e.target.value)}
                rows={6}
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-alt, #2a2a3e)', color: 'var(--text)', border: '1px solid var(--border, #333)', borderRadius: 4, padding: 8, fontFamily: 'inherit', fontSize: 13 }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="task-btn task-btn-approve"
                  onClick={() => { onUpdate(task.id, { body: bodyDraft }); setEditingBody(false); }}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="task-btn"
                  onClick={() => { setEditingBody(false); setBodyDraft(task.body || ''); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="task-detail-body" style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
              {task.body || '(no description)'}
            </div>
          )}
        </div>

        {/* Slack thread link */}
        <SlackThreadLink task={task} />

        {/* Artifacts section */}
        {events?.artifacts && events.artifacts.length > 0 && (
          <div className="task-detail-section">
            <ArtifactSection artifacts={events.artifacts} onImageClick={setLightboxUrl} />
          </div>
        )}

        {/* Image lightbox */}
        {lightboxUrl && (
          <div className="artifact-lightbox" onClick={() => setLightboxUrl(null)}>
            <img src={lightboxUrl} alt="Full size" />
          </div>
        )}

        {/* Supervisor Review section */}
        {task.supervisor_data && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <h4 style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)' }}>Supervisor Review</h4>
              <span style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 4,
                background: 'rgba(251,191,36,0.15)',
                color: '#fbbf24',
                border: '1px solid rgba(251,191,36,0.3)',
              }}>
                {task.supervisor_data.step.replace(/-/g, ' ')}
              </span>
              {task.supervisor_rounds != null && task.supervisor_rounds > 0 && (
                <span className="small mono" style={{ color: 'var(--text-dim)' }}>
                  round {task.supervisor_rounds}
                </span>
              )}
            </div>

            {task.supervisor_data.proposed_plan && (
              <div style={{ marginBottom: 12 }}>
                <span className="small" style={{ color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>Proposed Plan</span>
                <div className="supervisor-plan-md" style={{
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: 'var(--text)',
                  background: 'var(--surface-alt, #2a2a3e)',
                  border: '1px solid var(--border, #333)',
                  borderRadius: 6,
                  padding: 12,
                  maxHeight: 300,
                  overflowY: 'auto',
                }}>
                  <Markdown>
                    {task.supervisor_data.proposed_plan
                      .replace(/<\/?proposed_plan>/g, '')
                      .trim()}
                  </Markdown>
                </div>
              </div>
            )}

            {task.supervisor_data.questions && task.supervisor_data.questions.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <span className="small" style={{ color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>Agent Questions</span>
                <div style={{
                  background: 'var(--surface-alt, #2a2a3e)',
                  border: '1px solid var(--border, #333)',
                  borderRadius: 6,
                  padding: 12,
                }}>
                  {task.supervisor_data.questions.map((q, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text)', marginBottom: i < task.supervisor_data!.questions!.length - 1 ? 8 : 0 }}>
                      {q}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {task.supervisor_data.run_id && (
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '2px 8px', fontSize: 11, color: 'var(--text-dim)' }}>
                <span>Run ID</span>
                <span className="mono">{task.supervisor_data.run_id}</span>
                {task.supervisor_data.session && (
                  <>
                    <span>Session</span>
                    <span className="mono">{task.supervisor_data.session}</span>
                  </>
                )}
              </div>
            )}

            {task.status === 'supervising' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="task-btn task-btn-approve"
                  onClick={() => onAction(task.id, 'reject')}
                >
                  Approve &amp; Re-queue
                </button>
                <button
                  type="button"
                  className="task-btn task-btn-reject"
                  onClick={() => onMove(task.id, 'blocked')}
                >
                  Block
                </button>
              </div>
            )}
          </div>
        )}

        {/* Dependencies section */}
        <div className="task-detail-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <h4 className="task-detail-section-title" style={{ margin: 0 }}>Dependencies</h4>
            {!editingDeps && (
              <button type="button" className="task-btn small" style={{ fontSize: 11, padding: '1px 6px' }}
                onClick={() => { setDepsDraft(task.depends_on || []); setEditingDeps(true); }}>
                Edit
              </button>
            )}
          </div>
          {editingDeps ? (
            <div>
              <DependencyPicker
                tasks={tasks.filter(t => t.id !== task.id && t.status !== 'done')}
                selected={depsDraft}
                onChange={setDepsDraft}
              />
              <div className="task-detail-body-actions">
                <button type="button" className="task-btn task-btn-approve"
                  onClick={() => { onUpdate(task.id, { depends_on: depsDraft }); setEditingDeps(false); }}>
                  Save
                </button>
                <button type="button" className="task-btn"
                  onClick={() => { setEditingDeps(false); setDepsDraft(task.depends_on || []); }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {task.depends_on && task.depends_on.length > 0 && (
                <div className="task-dep-list" style={{ marginBottom: 8 }}>
                  <span className="small" style={{ color: 'var(--text-dim)', marginBottom: 4, display: 'block' }}>Depends on</span>
                  {task.depends_on.map((depId) => {
                    const dep = tasks.find(t => t.id === depId);
                    const isDone = dep?.status === 'done';
                    return (
                      <div key={depId} className={`task-dep-item${!isDone ? ' unmet' : ''}`}>
                        <span className="task-dep-item-id">{depId}</span>
                        <span className="task-dep-item-title">{dep?.title || depId}</span>
                        <span className={`task-dep-item-status ${isDone ? 'done' : 'unmet'}`}>
                          {dep ? dep.status.replace(/_/g, ' ') : 'unknown'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {blockers.length > 0 && (
                <div className="task-dep-list">
                  <span className="small" style={{ color: 'var(--text-dim)', marginBottom: 4, display: 'block' }}>Blocks</span>
                  {blockers.map((b) => (
                    <div key={b.id} className="task-dep-item">
                      <span className="task-dep-item-id">{b.id}</span>
                      <span className="task-dep-item-title">{b.title}</span>
                      <span className={`task-dep-item-status ${b.status === 'done' ? 'done' : 'unmet'}`}>
                        {b.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {!task.depends_on?.length && blockers.length === 0 && (
                <span className="small" style={{ color: 'var(--text-dim)' }}>No dependencies</span>
              )}
            </>
          )}
        </div>

        {/* Actions section */}
        <div className="task-card-actions" style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          {task.status === 'backlog' && (
            <button type="button" className="task-btn" onClick={() => onMove(task.id, 'todo')}>
              Promote
            </button>
          )}
          {task.status === 'human_review' && (
            <>
              <button
                type="button"
                className="task-btn task-btn-approve"
                onClick={() => onAction(task.id, 'approve')}
              >
                Approve
              </button>
              <button
                type="button"
                className="task-btn task-btn-reject"
                onClick={() => onAction(task.id, 'reject')}
              >
                Reject
              </button>
            </>
          )}
          {task.status === 'blocked' && (
            <button type="button" className="task-btn" onClick={() => onAction(task.id, 'unblock')}>
              Unblock
            </button>
          )}
          <button
            type="button"
            className="task-btn task-btn-reject"
            onClick={() => onDelete(task.id)}
          >
            Delete
          </button>
        </div>

        {/* Events/Debug section */}
        {events && (
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13, color: 'var(--text-dim)' }}>Events</h4>
            <div className="task-debug-panel">
              <div className="task-debug-row">
                <span className="task-debug-label">Phase</span>
                <span className="task-debug-value" data-phase={events.phase}>
                  {events.phase}
                </span>
              </div>
              {events.branch && (
                <div className="task-debug-row">
                  <span className="task-debug-label">Branch</span>
                  <span className="task-debug-value">{events.branch}</span>
                </div>
              )}
              {events.gate_passed !== null && (
                <div className="task-debug-row">
                  <span className="task-debug-label">Gate</span>
                  <span className="task-debug-value" style={{
                    color: events.gate_passed ? 'var(--ok)' : 'var(--err)'
                  }}>
                    {events.gate_passed ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
              )}
              {events.error && (
                <div className="task-debug-row" style={{ color: 'var(--err)' }}>
                  {events.error}
                </div>
              )}
              {events.log_tail.length > 0 && (
                <div className="task-debug-log">
                  {events.log_tail.map((line, i) => (
                    <div key={i} className="task-debug-log-line">{line}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
