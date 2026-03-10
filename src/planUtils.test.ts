import { describe, expect, it } from 'vitest';
import { parsePlan, getPendingApprovals } from './planUtils';

describe('parsePlan', () => {
  it('returns null for null/undefined input', () => {
    expect(parsePlan(null)).toBeNull();
    expect(parsePlan(undefined)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parsePlan('string')).toBeNull();
    expect(parsePlan(42)).toBeNull();
  });

  it('returns null when planId or tasks is missing', () => {
    expect(parsePlan({ tasks: [] })).toBeNull();
    expect(parsePlan({ planId: '123' })).toBeNull();
  });

  it('parses a valid plan', () => {
    const raw = {
      date: '2026-03-10',
      planId: '962484',
      tasks: [
        { idx: 1, title: 'Task A', why: 'Reason A', acceptance: 'Criteria A' },
        { idx: 2, title: 'Task B', why: 'Reason B', acceptance: 'Criteria B' },
      ],
      approved: [],
    };

    const result = parsePlan(raw);
    expect(result).not.toBeNull();
    expect(result!.planId).toBe('962484');
    expect(result!.tasks).toHaveLength(2);
    expect(result!.tasks[0].title).toBe('Task A');
    expect(result!.approved).toEqual([]);
  });

  it('handles partial approvals', () => {
    const raw = {
      planId: '100',
      tasks: [{ idx: 1, title: 'T1', why: '', acceptance: '' }],
      approved: [1],
    };

    const result = parsePlan(raw);
    expect(result!.approved).toEqual([1]);
  });

  it('skips malformed tasks', () => {
    const raw = {
      planId: '100',
      tasks: [
        { idx: 1, title: 'Valid' },
        { notAnIdx: true },
        null,
        { idx: 'string', title: 'Bad idx' },
      ],
      approved: [],
    };

    const result = parsePlan(raw);
    expect(result!.tasks).toHaveLength(1);
    expect(result!.tasks[0].title).toBe('Valid');
  });

  it('defaults missing optional fields', () => {
    const raw = {
      planId: '100',
      tasks: [{ idx: 1, title: 'Minimal' }],
      approved: [],
    };

    const result = parsePlan(raw);
    expect(result!.tasks[0].why).toBe('');
    expect(result!.tasks[0].acceptance).toBe('');
    expect(result!.date).toBe('');
  });
});

describe('getPendingApprovals', () => {
  it('returns empty for null plan', () => {
    expect(getPendingApprovals(null)).toEqual([]);
  });

  it('returns all tasks when none approved', () => {
    const plan = {
      date: '2026-03-10',
      planId: '962484',
      tasks: [
        { idx: 1, title: 'T1', why: 'W1', acceptance: 'A1' },
        { idx: 2, title: 'T2', why: 'W2', acceptance: 'A2' },
      ],
      approved: [],
    };

    const pending = getPendingApprovals(plan);
    expect(pending).toHaveLength(2);
    expect(pending[0].task.title).toBe('T1');
    expect(pending[0].approvalCommand).toBe('openclaw plan approve 962484 --task 1');
    expect(pending[1].approvalCommand).toBe('openclaw plan approve 962484 --task 2');
  });

  it('filters out approved tasks', () => {
    const plan = {
      date: '2026-03-10',
      planId: '100',
      tasks: [
        { idx: 1, title: 'T1', why: '', acceptance: '' },
        { idx: 2, title: 'T2', why: '', acceptance: '' },
        { idx: 3, title: 'T3', why: '', acceptance: '' },
      ],
      approved: [1, 3],
    };

    const pending = getPendingApprovals(plan);
    expect(pending).toHaveLength(1);
    expect(pending[0].task.idx).toBe(2);
  });

  it('returns empty when all tasks approved', () => {
    const plan = {
      date: '2026-03-10',
      planId: '100',
      tasks: [
        { idx: 1, title: 'T1', why: '', acceptance: '' },
        { idx: 2, title: 'T2', why: '', acceptance: '' },
      ],
      approved: [1, 2],
    };

    expect(getPendingApprovals(plan)).toEqual([]);
  });

  it('includes planId in each pending item', () => {
    const plan = {
      date: '2026-03-10',
      planId: 'xyz',
      tasks: [{ idx: 1, title: 'T1', why: '', acceptance: '' }],
      approved: [],
    };

    const pending = getPendingApprovals(plan);
    expect(pending[0].planId).toBe('xyz');
  });
});
