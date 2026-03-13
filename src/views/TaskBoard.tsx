import { useState, useEffect, useMemo, useCallback } from 'react';
import { Task, TaskStatus, TaskType, TaskPriority, TASK_COLUMNS, priorityColor, taskTypeLabel } from '../types';

const API_BASE = '/api';
const POLL_INTERVAL = 5000;

type Props = Record<string, never>;

export default function TaskBoard(_props: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

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
    const id = setInterval(() => void fetchTasks(), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchTasks]);

  const columns = useMemo(() => {
    return TASK_COLUMNS.map((col) => ({
      ...col,
      tasks: tasks.filter((t) => t.status === col.id),
    }));
  }, [tasks]);

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

  return (
    <div className="task-board">
      <div className="task-board-toolbar">
        <button type="button" className="task-btn task-btn-create" onClick={() => setShowCreate(true)}>
          + New Task
        </button>
      </div>
      {showCreate && <CreateTaskForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />}
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
                />
              ))}
              {col.tasks.length === 0 && (
                <div className="empty-state" style={{ padding: '24px 8px' }}>None</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateTaskForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: {
    title: string;
    type: TaskType;
    priority: TaskPriority;
    body: string;
    repo: string;
    base_branch: string;
  }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('coding');
  const [priority, setPriority] = useState<TaskPriority>('P1');
  const [body, setBody] = useState('');
  const [repo, setRepo] = useState('~/Documents/mission-control');
  const [baseBranch, setBaseBranch] = useState('main');

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
        <label>
          Description
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Context and instructions for the agent..."
          />
        </label>
        <div className="create-task-actions">
          <button type="button" className="task-btn" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="task-btn task-btn-approve"
            disabled={!title.trim()}
            onClick={() => onSubmit({ title, type, priority, body, repo, base_branch: baseBranch })}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onAction,
  onMove,
}: {
  task: Task;
  onAction: (id: string, action: string) => void;
  onMove: (id: string, status: TaskStatus) => void;
}) {
  const elapsed = task.agent_started_at
    ? Math.round((Date.now() - new Date(task.agent_started_at).getTime()) / 60000)
    : null;

  return (
    <div className="kanban-card task-card">
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
      </div>

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
        >
          {task.pr_url.replace(/.*\/pull\//, 'PR #')}
        </a>
      )}

      <div className="task-card-actions">
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
      </div>
    </div>
  );
}
