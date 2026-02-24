#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';

function fail(message, details) {
  console.error(`ERROR: ${message}`);
  if (details) {
    console.error(details);
  }
  process.exit(1);
}

function runOpenclawJson(args, label) {
  const result = spawnSync('openclaw', args, { encoding: 'utf8' });

  if (result.error) {
    fail(`Could not run ${label}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();
    fail(`${label} exited with code ${result.status}.`, stderr || stdout || 'No output.');
  }

  return (result.stdout || '').trim();
}

function parseJsonOrFail(label, raw) {
  if (!raw) {
    fail(`${label} returned empty output.`);
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    const trimmed = raw.trim();
    const firstBrace = trimmed.indexOf('{');
    const firstBracket = trimmed.indexOf('[');
    const start =
      firstBrace >= 0 && firstBracket >= 0
        ? Math.min(firstBrace, firstBracket)
        : firstBrace >= 0
          ? firstBrace
          : firstBracket;

    if (start > 0) {
      const candidate = trimmed.slice(start);
      try {
        return JSON.parse(candidate);
      } catch {}
    }

    const preview = trimmed.replace(/\s+/g, ' ').slice(0, 220);
    fail(`Failed to parse JSON from ${label}: ${err.message}`, `Output preview: ${preview}`);
  }
}

function extractListOrFail(payload, keys, label) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    for (const key of keys) {
      if (Array.isArray(payload[key])) {
        return payload[key];
      }
    }
  }
  fail(`Parsed ${label} JSON but could not find an array (${keys.join(', ')}).`);
}

function pickAgentModel(agent) {
  if (!agent || typeof agent !== 'object') {
    return '';
  }
  return (
    agent.model ||
    agent.primaryModel ||
    agent.defaults?.model?.primary ||
    agent.defaults?.model ||
    agent.agentDefaults?.model ||
    ''
  );
}

function formatSchedule(schedule) {
  if (!schedule) {
    return '-';
  }
  if (typeof schedule === 'string') {
    return schedule;
  }
  if (schedule.kind === 'cron') {
    const expr = schedule.expr || schedule.cron || '';
    const tz = schedule.tz || schedule.timezone || '';
    return `cron ${expr}${tz ? ` @ ${tz}` : ''}`.trim();
  }
  if (schedule.kind) {
    return String(schedule.kind);
  }
  return '-';
}

function clipAndPad(value, width) {
  const text = String(value ?? '-');
  if (text.length > width) {
    if (width <= 3) {
      return text.slice(0, width);
    }
    return `${text.slice(0, width - 3)}...`;
  }
  return text.padEnd(width, ' ');
}

function printTable(rows) {
  const columns = [
    { key: 'name', title: 'job name', max: 42 },
    { key: 'agentId', title: 'agentId', max: 24 },
    { key: 'model', title: 'model', max: 30 },
    { key: 'schedule', title: 'schedule', max: 36 },
    { key: 'thinking', title: 'thinking', max: 8 },
    { key: 'enabled', title: 'enabled', max: 7 }
  ];

  const widths = Object.fromEntries(
    columns.map((col) => {
      const maxCell = rows.reduce((max, row) => Math.max(max, String(row[col.key] ?? '-').length), col.title.length);
      return [col.key, Math.min(col.max, maxCell)];
    })
  );

  const header = columns.map((col) => clipAndPad(col.title, widths[col.key])).join(' | ');
  const sep = columns.map((col) => '-'.repeat(widths[col.key])).join('-+-');

  console.log(header);
  console.log(sep);
  for (const row of rows) {
    console.log(columns.map((col) => clipAndPad(row[col.key], widths[col.key])).join(' | '));
  }
}

function main() {
  const cronRaw = runOpenclawJson(['cron', 'list', '--all', '--json'], 'openclaw cron list --all --json');
  const agentsRaw = runOpenclawJson(['agents', 'list', '--json'], 'openclaw agents list --json');

  const cronPayload = parseJsonOrFail('openclaw cron list --all --json', cronRaw);
  const agentsPayload = parseJsonOrFail('openclaw agents list --json', agentsRaw);

  const jobs = extractListOrFail(cronPayload, ['jobs', 'data', 'list', 'items'], 'cron');
  const agents = extractListOrFail(agentsPayload, ['agents', 'data', 'list', 'items'], 'agents');

  const modelByAgentId = new Map();
  for (const agent of agents) {
    if (!agent || typeof agent !== 'object' || !agent.id) {
      continue;
    }
    modelByAgentId.set(agent.id, pickAgentModel(agent) || '-');
  }

  const defaultAgent = agents.find((agent) => agent && typeof agent === 'object' && agent.isDefault);
  const topLevelDefault =
    agentsPayload && typeof agentsPayload === 'object'
      ? agentsPayload.defaults?.model?.primary || agentsPayload.defaults?.model || agentsPayload.agentDefaults?.model
      : '';
  const defaultModel = pickAgentModel(defaultAgent) || topLevelDefault || '-';

  const rows = jobs.map((job) => {
    const agentId = job?.agentId || '(default)';
    const enabled = typeof job?.enabled === 'boolean' ? String(job.enabled) : '-';
    return {
      name: job?.name || job?.id || '-',
      agentId,
      model: modelByAgentId.get(agentId) || defaultModel,
      schedule: formatSchedule(job?.schedule),
      thinking: job?.payload?.thinking || job?.thinking || '-',
      enabled
    };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name));
  printTable(rows);
}

main();
