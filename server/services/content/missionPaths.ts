import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AppConfig } from '../../config';

export function getMissionPaths(config: AppConfig) {
  const root = resolve(process.cwd(), config.contentRoot);

  return {
    root,
    exists: existsSync(root),
    inboxVoice: resolve(root, 'inbox', 'voice'),
    decisions: resolve(root, 'decisions'),
    approvals: resolve(root, 'approvals'),
    exceptions: resolve(root, 'exceptions'),
    shipped: resolve(root, 'shipped'),
    departments: {
      ceo: resolve(root, 'departments', 'ceo', 'tasks'),
      productEngineering: resolve(root, 'departments', 'product-engineering', 'tasks'),
      growthSales: resolve(root, 'departments', 'growth-sales', 'tasks'),
      operations: resolve(root, 'departments', 'operations', 'tasks'),
    },
  };
}
