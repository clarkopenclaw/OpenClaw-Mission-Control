export type PlanTask = {
  idx: number;
  title: string;
  why: string;
  acceptance: string;
};

export type PlanData = {
  date: string;
  planId: string;
  tasks: PlanTask[];
  approved: number[];
};

export type PendingApproval = {
  task: PlanTask;
  planId: string;
  approvalCommand: string;
};

export function parsePlan(raw: unknown): PlanData | null {
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;
  if (typeof obj.planId !== 'string' || !Array.isArray(obj.tasks)) return null;

  const tasks: PlanTask[] = [];
  for (const t of obj.tasks) {
    if (!t || typeof t !== 'object') continue;
    const task = t as Record<string, unknown>;
    if (typeof task.idx !== 'number' || typeof task.title !== 'string') continue;
    tasks.push({
      idx: task.idx,
      title: task.title,
      why: typeof task.why === 'string' ? task.why : '',
      acceptance: typeof task.acceptance === 'string' ? task.acceptance : '',
    });
  }

  const approved: number[] = [];
  if (Array.isArray(obj.approved)) {
    for (const v of obj.approved) {
      if (typeof v === 'number') approved.push(v);
    }
  }

  return {
    date: typeof obj.date === 'string' ? obj.date : '',
    planId: obj.planId,
    tasks,
    approved,
  };
}

export function getPendingApprovals(plan: PlanData | null): PendingApproval[] {
  if (!plan) return [];

  const approvedSet = new Set(plan.approved);
  return plan.tasks
    .filter((task) => !approvedSet.has(task.idx))
    .map((task) => ({
      task,
      planId: plan.planId,
      approvalCommand: `openclaw plan approve ${plan.planId} --task ${task.idx}`,
    }));
}
