import { useEffect, useMemo, useState } from 'react';

type Session = {
  agentId: string;
  key: string;
  kind: string;
  age: number;
  model: string;
  contextTokens: number;
  totalTokens?: number;
  percentUsed?: number;
  updatedAt: number;
};

type AgentSummary = {
  id: string;
  sessionCount: number;
  hotSessions: number;
  totalTokens: number;
};

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatTokens(n?: number): string {
  if (n === undefined || n === null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function badgeClass(percent?: number): string {
  if (percent === undefined || percent === null) return 'badge';
  if (percent >= 80) return 'badge err';
  if (percent >= 50) return 'badge';
  return 'badge ok';
}

async function loadJson(path: string): Promise<unknown> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`);
  }
  return res.json();
}

function extractSessions(payload: unknown): Session[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = payload as Record<string, unknown>;
  const sessions = data.sessions as Record<string, unknown> | undefined;
  if (!sessions || typeof sessions !== 'object') return [];
  const recent = sessions.recent as unknown[] | undefined;
  if (!Array.isArray(recent)) return [];
  return recent as Session[];
}

export default function SessionHealth() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>('Loading...');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    void (async () => {
      try {
        const statusData = await loadJson('/data/openclaw-status.json');
        const sessionsData = extractSessions(statusData);
        setSessions(sessionsData);

        const metaRes = await fetch('/data/meta.json', { cache: 'no-store' });
        if (metaRes.ok) {
          const meta = await metaRes.json();
          const ts = meta?.generatedAt;
          if (ts) {
            const date = new Date(ts > 1e12 ? ts : ts * 1000);
            setGeneratedAt(date.toLocaleString());
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load session data');
      }
    })();
  }, []);

  const agentSummary = useMemo(() => {
    const byAgent = new Map<string, AgentSummary>();
    for (const s of sessions) {
      const existing = byAgent.get(s.agentId) || { id: s.agentId, sessionCount: 0, hotSessions: 0, totalTokens: 0 };
      existing.sessionCount += 1;
      if ((s.percentUsed ?? 0) >= 50) existing.hotSessions += 1;
      existing.totalTokens += s.totalTokens ?? 0;
      byAgent.set(s.agentId, existing);
    }
    return Array.from(byAgent.values()).sort((a, b) => b.sessionCount - a.sessionCount);
  }, [sessions]);

  const topSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => (b.percentUsed ?? 0) - (a.percentUsed ?? 0))
      .slice(0, 10);
  }, [sessions]);

  if (error) {
    return (
      <section className="card">
        <h2>Agent sessions</h2>
        <div className="small">Failed to load: {error}. Run ./refresh.sh.</div>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>Agent sessions</h2>
        <div className="small mono">Generated: {generatedAt}</div>
      </div>

      <div className="filters">
        <span>{sessions.length} total sessions</span>
      </div>

      <h3>By agent</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Sessions</th>
            <th>Hot (50%+)</th>
            <th>Total tokens</th>
          </tr>
        </thead>
        <tbody>
          {agentSummary.length === 0 ? (
            <tr>
              <td colSpan={4} className="small">No agent data</td>
            </tr>
          ) : (
            agentSummary.map((a) => (
              <tr key={a.id}>
                <td><b>{a.id}</b></td>
                <td>{a.sessionCount}</td>
                <td>{a.hotSessions}</td>
                <td className="mono">{formatTokens(a.totalTokens)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h3>Top active sessions</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Kind</th>
            <th>Age</th>
            <th>Model</th>
            <th>Tokens</th>
            <th>Usage</th>
          </tr>
        </thead>
        <tbody>
          {topSessions.map((s, i) => (
            <tr key={`${s.key}-${i}`}>
              <td>{s.agentId}</td>
              <td className="mono">{s.kind}</td>
              <td className="mono">{formatAge(s.age)}</td>
              <td className="mono">{s.model}</td>
              <td className="mono">{formatTokens(s.totalTokens)}</td>
              <td><span className={badgeClass(s.percentUsed)}>{s.percentUsed ?? '—'}%</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}