import { describe, it, expect } from 'vitest';
import {
  parseStatusPayload,
  deriveAgentSummaries,
  deriveHotSessions,
  deriveTotals,
  formatAgeMs,
  type StatusPayload,
} from './statusHelpers';

describe('parseStatusPayload', () => {
  it('returns null for non-object input', () => {
    expect(parseStatusPayload(null)).toBeNull();
    expect(parseStatusPayload(undefined)).toBeNull();
    expect(parseStatusPayload('string')).toBeNull();
    expect(parseStatusPayload(42)).toBeNull();
  });

  it('returns the object as StatusPayload for valid input', () => {
    const input = { agents: { agents: [] } };
    expect(parseStatusPayload(input)).toBe(input);
  });
});

describe('formatAgeMs', () => {
  it('formats seconds', () => {
    expect(formatAgeMs(5000)).toBe('5s ago');
  });

  it('formats minutes', () => {
    expect(formatAgeMs(120_000)).toBe('2m ago');
  });

  it('formats hours', () => {
    expect(formatAgeMs(7_200_000)).toBe('2h ago');
  });

  it('formats days', () => {
    expect(formatAgeMs(172_800_000)).toBe('2d ago');
  });

  it('handles null/undefined', () => {
    expect(formatAgeMs(null)).toBe('—');
    expect(formatAgeMs(undefined)).toBe('—');
  });
});

const MULTI_AGENT_PAYLOAD: StatusPayload = {
  heartbeat: {
    defaultAgentId: 'clark-workspace',
    agents: [
      { agentId: 'clark-workspace', enabled: true, every: '30m', everyMs: 1800000 },
      { agentId: 'main', enabled: false, every: 'disabled', everyMs: null },
    ],
  },
  sessions: {
    count: 189,
    defaults: { model: 'gpt-5.4', contextTokens: 200000 },
    recent: [
      {
        agentId: 'clark-workspace',
        key: 'agent:clark-workspace:slack:channel:c0akr8zhg3c:thread:123',
        kind: 'group',
        sessionId: 'sess-1',
        updatedAt: 1773183847438,
        age: 39098,
        totalTokens: 36643,
        percentUsed: 13,
        model: 'gpt-5.4',
        contextTokens: 272000,
      },
      {
        agentId: 'clark-workspace',
        key: 'agent:clark-workspace:subagent:abc',
        kind: 'direct',
        sessionId: 'sess-2',
        updatedAt: 1773183847260,
        age: 39276,
        totalTokens: null,
        percentUsed: null,
        model: 'gpt-5.4',
        contextTokens: 200000,
      },
      {
        agentId: 'clark-workspace',
        key: 'agent:clark-workspace:main',
        kind: 'direct',
        sessionId: 'sess-3',
        updatedAt: 1773183756828,
        age: 129708,
        totalTokens: 26135,
        percentUsed: 13,
        model: 'minimax/minimax-m2.5',
        contextTokens: 196608,
      },
    ],
    byAgent: [
      { agentId: 'clark-workspace', count: 188 },
      { agentId: 'main', count: 1 },
    ],
  },
  agents: {
    defaultId: 'clark-workspace',
    agents: [
      {
        id: 'clark-workspace',
        name: 'clark-workspace',
        bootstrapPending: false,
        sessionsCount: 188,
        lastActiveAgeMs: 39094,
      },
      {
        id: 'main',
        bootstrapPending: true,
        sessionsCount: 1,
        lastActiveAgeMs: 1217217903,
      },
    ],
    totalSessions: 189,
    bootstrapPendingCount: 1,
  },
};

describe('deriveAgentSummaries', () => {
  it('derives summaries for multi-agent payload', () => {
    const summaries = deriveAgentSummaries(MULTI_AGENT_PAYLOAD);
    expect(summaries).toHaveLength(2);

    const clark = summaries[0];
    expect(clark.id).toBe('clark-workspace');
    expect(clark.sessionsCount).toBe(188);
    expect(clark.bootstrapPending).toBe(false);
    expect(clark.heartbeatEnabled).toBe(true);
    expect(clark.heartbeatEvery).toBe('30m');

    const main = summaries[1];
    expect(main.id).toBe('main');
    expect(main.sessionsCount).toBe(1);
    expect(main.bootstrapPending).toBe(true);
    expect(main.heartbeatEnabled).toBe(false);
  });

  it('handles empty agents', () => {
    const summaries = deriveAgentSummaries({ agents: { agents: [] } });
    expect(summaries).toEqual([]);
  });

  it('handles missing agents section', () => {
    const summaries = deriveAgentSummaries({});
    expect(summaries).toEqual([]);
  });
});

describe('deriveHotSessions', () => {
  it('returns recent sessions sorted by age', () => {
    const hot = deriveHotSessions(MULTI_AGENT_PAYLOAD, 5);
    expect(hot).toHaveLength(3);
    expect(hot[0].ageMs).toBe(39098);
    expect(hot[0].keySnippet).toBe('slack:channel:c0akr8zhg3c:thread:123');
    expect(hot[1].ageMs).toBe(39276);
    expect(hot[2].ageMs).toBe(129708);
  });

  it('respects limit', () => {
    const hot = deriveHotSessions(MULTI_AGENT_PAYLOAD, 1);
    expect(hot).toHaveLength(1);
  });

  it('handles missing sessions', () => {
    const hot = deriveHotSessions({});
    expect(hot).toEqual([]);
  });

  it('handles null token fields', () => {
    const hot = deriveHotSessions(MULTI_AGENT_PAYLOAD, 5);
    const nullTokenSession = hot.find((s) => s.totalTokens === null);
    expect(nullTokenSession).toBeDefined();
    expect(nullTokenSession?.percentUsed).toBeNull();
  });

  it('deduplicates by sessionId', () => {
    const payload: StatusPayload = {
      sessions: {
        recent: [
          { sessionId: 'dup-1', key: 'key-a', age: 100, agentId: 'a' },
          { sessionId: 'dup-1', key: 'key-b', age: 100, agentId: 'a' },
          { sessionId: 'dup-2', key: 'key-c', age: 200, agentId: 'a' },
        ],
      },
    };
    const hot = deriveHotSessions(payload);
    expect(hot).toHaveLength(2);
  });
});

describe('deriveTotals', () => {
  it('returns totals from agents section', () => {
    const totals = deriveTotals(MULTI_AGENT_PAYLOAD);
    expect(totals.totalSessions).toBe(189);
    expect(totals.bootstrapPendingCount).toBe(1);
  });

  it('falls back to sessions.count', () => {
    const totals = deriveTotals({ sessions: { count: 42 } });
    expect(totals.totalSessions).toBe(42);
    expect(totals.bootstrapPendingCount).toBe(0);
  });

  it('handles empty payload', () => {
    const totals = deriveTotals({});
    expect(totals.totalSessions).toBe(0);
    expect(totals.bootstrapPendingCount).toBe(0);
  });
});
