// Pure helpers for parsing `openclaw status --json` and deriving UI state.

export type StatusSession = {
  agentId?: string;
  key?: string;
  kind?: string;
  sessionId?: string;
  updatedAt?: number;
  age?: number;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number | null;
  totalTokensFresh?: boolean;
  remainingTokens?: number | null;
  percentUsed?: number | null;
  model?: string;
  contextTokens?: number;
  flags?: string[];
};

export type StatusAgent = {
  id?: string;
  name?: string;
  workspaceDir?: string;
  bootstrapPending?: boolean;
  sessionsCount?: number;
  lastUpdatedAt?: number;
  lastActiveAgeMs?: number;
};

export type HeartbeatAgent = {
  agentId?: string;
  enabled?: boolean;
  every?: string;
  everyMs?: number | null;
};

export type StatusPayload = {
  heartbeat?: {
    defaultAgentId?: string;
    agents?: HeartbeatAgent[];
  };
  sessions?: {
    count?: number;
    defaults?: { model?: string; contextTokens?: number };
    recent?: StatusSession[];
    byAgent?: {
      agentId?: string;
      count?: number;
      recent?: StatusSession[];
    }[];
  };
  agents?: {
    defaultId?: string;
    agents?: StatusAgent[];
    totalSessions?: number;
    bootstrapPendingCount?: number;
  };
};

export type AgentSummary = {
  id: string;
  name: string;
  sessionsCount: number;
  lastActiveAgeMs: number | null;
  bootstrapPending: boolean;
  heartbeatEnabled: boolean;
  heartbeatEvery: string;
};

export type HotSession = {
  agentId: string;
  keySnippet: string;
  model: string;
  percentUsed: number | null;
  ageMs: number;
  totalTokens: number | null;
  kind: string;
};

export function parseStatusPayload(raw: unknown): StatusPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as StatusPayload;
}

export function formatAgeMs(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function deriveAgentSummaries(payload: StatusPayload): AgentSummary[] {
  const agents = payload.agents?.agents ?? [];
  const heartbeatAgents = payload.heartbeat?.agents ?? [];

  const heartbeatByAgent = new Map<string, HeartbeatAgent>();
  for (const hb of heartbeatAgents) {
    if (hb.agentId) heartbeatByAgent.set(hb.agentId, hb);
  }

  return agents.map((agent) => {
    const id = agent.id ?? 'unknown';
    const hb = heartbeatByAgent.get(id);
    return {
      id,
      name: agent.name ?? id,
      sessionsCount: agent.sessionsCount ?? 0,
      lastActiveAgeMs: agent.lastActiveAgeMs ?? null,
      bootstrapPending: agent.bootstrapPending ?? false,
      heartbeatEnabled: hb?.enabled ?? false,
      heartbeatEvery: hb?.every ?? '—',
    };
  });
}

function sessionKeySnippet(key?: string): string {
  if (!key) return '—';
  // Strip common prefix "agent:<agentId>:" to save space
  const parts = key.split(':');
  if (parts.length > 2 && parts[0] === 'agent') {
    return parts.slice(2).join(':');
  }
  return key;
}

export function deriveHotSessions(payload: StatusPayload, limit = 5): HotSession[] {
  const recent = payload.sessions?.recent ?? [];

  // Deduplicate by sessionId (some sessions appear twice with different keys)
  const seen = new Set<string>();
  const deduped: StatusSession[] = [];
  for (const s of recent) {
    const sid = s.sessionId ?? s.key ?? '';
    if (seen.has(sid)) continue;
    seen.add(sid);
    deduped.push(s);
  }

  // Sort by recency (lowest age first), then by token usage desc
  const sorted = [...deduped].sort((a, b) => {
    const ageA = a.age ?? Infinity;
    const ageB = b.age ?? Infinity;
    if (ageA !== ageB) return ageA - ageB;
    return (b.totalTokens ?? 0) - (a.totalTokens ?? 0);
  });

  return sorted.slice(0, limit).map((s) => ({
    agentId: s.agentId ?? '—',
    keySnippet: sessionKeySnippet(s.key),
    model: s.model ?? '—',
    percentUsed: s.percentUsed ?? null,
    ageMs: s.age ?? 0,
    totalTokens: s.totalTokens ?? null,
    kind: s.kind ?? '—',
  }));
}

export function deriveTotals(payload: StatusPayload): {
  totalSessions: number;
  bootstrapPendingCount: number;
} {
  return {
    totalSessions: payload.agents?.totalSessions ?? payload.sessions?.count ?? 0,
    bootstrapPendingCount: payload.agents?.bootstrapPendingCount ?? 0,
  };
}
