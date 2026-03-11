import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { classifyJobsByStatus, BOARD_COLUMNS, BoardView } from './board';
import type { CronJob } from './board';

const makeJob = (overrides: Partial<CronJob> = {}): CronJob => ({
  id: 'test-job',
  name: 'Test Job',
  agentId: 'agent-1',
  enabled: true,
  schedule: { expr: '0 9 * * *', tz: 'UTC' },
  state: { lastRunStatus: 'ok', nextRunAtMs: Date.now() + 3600000 },
  ...overrides,
});

describe('classifyJobsByStatus', () => {
  it('places a job with ok status in the OK column', () => {
    const jobs = [makeJob({ state: { lastRunStatus: 'ok' } })];
    const result = classifyJobsByStatus(jobs);
    expect(result.ok).toHaveLength(1);
    expect(result.ok[0].name).toBe('Test Job');
  });

  it('places a job with error status in the Error column', () => {
    const jobs = [makeJob({ state: { lastRunStatus: 'error' } })];
    const result = classifyJobsByStatus(jobs);
    expect(result.error).toHaveLength(1);
  });

  it('places a job with fail status in the Error column', () => {
    const jobs = [makeJob({ state: { lastRunStatus: 'fail' } })];
    const result = classifyJobsByStatus(jobs);
    expect(result.error).toHaveLength(1);
  });

  it('places a disabled job in the Disabled column regardless of status', () => {
    const jobs = [makeJob({ enabled: false, state: { lastRunStatus: 'ok' } })];
    const result = classifyJobsByStatus(jobs);
    expect(result.disabled).toHaveLength(1);
    expect(result.ok).toHaveLength(0);
  });

  it('places a job with no status in the Idle column', () => {
    const jobs = [makeJob({ state: {} })];
    const result = classifyJobsByStatus(jobs);
    expect(result.idle).toHaveLength(1);
  });

  it('places a job with idle status in the Idle column', () => {
    const jobs = [makeJob({ state: { lastRunStatus: 'idle' } })];
    const result = classifyJobsByStatus(jobs);
    expect(result.idle).toHaveLength(1);
  });

  it('places a job with unknown status in the Idle column', () => {
    const jobs = [makeJob({ state: { lastRunStatus: 'pending' } })];
    const result = classifyJobsByStatus(jobs);
    expect(result.idle).toHaveLength(1);
  });

  it('distributes multiple jobs correctly', () => {
    const jobs = [
      makeJob({ id: '1', name: 'OK Job', state: { lastRunStatus: 'ok' } }),
      makeJob({ id: '2', name: 'Err Job', state: { lastRunStatus: 'error' } }),
      makeJob({ id: '3', name: 'Idle Job', state: {} }),
      makeJob({ id: '4', name: 'Off Job', enabled: false }),
    ];
    const result = classifyJobsByStatus(jobs);
    expect(result.ok).toHaveLength(1);
    expect(result.error).toHaveLength(1);
    expect(result.idle).toHaveLength(1);
    expect(result.disabled).toHaveLength(1);
  });

  it('returns empty arrays when no jobs provided', () => {
    const result = classifyJobsByStatus([]);
    expect(result.ok).toHaveLength(0);
    expect(result.error).toHaveLength(0);
    expect(result.idle).toHaveLength(0);
    expect(result.disabled).toHaveLength(0);
  });
});

describe('BOARD_COLUMNS', () => {
  it('has four columns in correct order', () => {
    expect(BOARD_COLUMNS.map((c) => c.key)).toEqual(['ok', 'error', 'idle', 'disabled']);
  });

  it('each column has a label', () => {
    for (const col of BOARD_COLUMNS) {
      expect(col.label).toBeTruthy();
    }
  });
});

describe('BoardView', () => {
  it('renders column headers', () => {
    render(<BoardView jobs={[]} modelByAgentId={{}} />);
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('renders job cards in correct columns', () => {
    const jobs = [
      makeJob({ id: '1', name: 'Healthy Job', state: { lastRunStatus: 'ok' } }),
      makeJob({ id: '2', name: 'Broken Job', state: { lastRunStatus: 'error' } }),
    ];
    render(<BoardView jobs={jobs} modelByAgentId={{}} />);
    expect(screen.getByText('Healthy Job')).toBeInTheDocument();
    expect(screen.getByText('Broken Job')).toBeInTheDocument();
  });

  it('shows column counts', () => {
    const jobs = [
      makeJob({ id: '1', state: { lastRunStatus: 'ok' } }),
      makeJob({ id: '2', state: { lastRunStatus: 'ok' } }),
      makeJob({ id: '3', state: { lastRunStatus: 'error' } }),
    ];
    render(<BoardView jobs={jobs} modelByAgentId={{}} />);
    // Column count badges
    expect(screen.getByText('2')).toBeInTheDocument(); // OK column
    expect(screen.getByText('1')).toBeInTheDocument(); // Error column
  });

  it('shows agent and model info on cards', () => {
    const jobs = [makeJob({ agentId: 'my-agent', state: { lastRunStatus: 'ok' } })];
    render(<BoardView jobs={jobs} modelByAgentId={{ 'my-agent': 'claude-3' }} />);
    expect(screen.getByText('my-agent')).toBeInTheDocument();
    expect(screen.getByText('claude-3')).toBeInTheDocument();
  });

  it('shows empty state when no jobs', () => {
    render(<BoardView jobs={[]} modelByAgentId={{}} />);
    // All columns should exist but have 0 counts
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBe(4);
  });
});
