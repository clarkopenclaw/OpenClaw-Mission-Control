#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function extractJobs(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ['jobs', 'data', 'list', 'items']) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  return [];
}

function parseJsonOrJsonLines(raw, label) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { entries: [] };
  }

  try {
    return JSON.parse(trimmed);
  } catch (jsonError) {
    const entries = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    return { entries };
  }
}

function extractRunEntries(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ['entries', 'runs', 'data', 'list', 'items']) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  return [];
}

function numberOrUndefined(value) {
  return typeof value === 'number' && !Number.isNaN(value) ? value : undefined;
}

function runSortKey(entry) {
  if (!isRecord(entry)) {
    return 0;
  }

  return (
    numberOrUndefined(entry.runAtMs) ??
    numberOrUndefined(entry.startedAtMs) ??
    numberOrUndefined(entry.ts) ??
    numberOrUndefined(entry.createdAtMs) ??
    0
  );
}

function runOpenclaw(args) {
  const result = spawnSync('openclaw', args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      TMPDIR: process.env.TMPDIR || process.cwd(),
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();
    throw new Error(stderr || stdout || `openclaw ${args.join(' ')} exited with code ${result.status}`);
  }

  return (result.stdout || '').trim();
}

function writeHelp(helpPath) {
  try {
    const result = spawnSync('openclaw', ['cron', 'runs', '--help'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        TMPDIR: process.env.TMPDIR || process.cwd(),
      },
    });
    const output = [(result.stdout || '').trim(), (result.stderr || '').trim()].filter(Boolean).join('\n');
    writeFileSync(helpPath, `${output}\n`, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeFileSync(helpPath, `${message}\n`, 'utf8');
  }
}

function main() {
  const [jobsPath, outputPath, helpPath] = process.argv.slice(2);

  if (!jobsPath || !outputPath || !helpPath) {
    console.error('Usage: node refresh-cron-runs.mjs <jobsPath> <outputPath> <helpPath>');
    process.exit(1);
  }

  writeHelp(helpPath);

  const jobsPayload = readJson(jobsPath);
  const jobs = extractJobs(jobsPayload).filter((job) => isRecord(job) && typeof job.id === 'string');

  const runs = [];
  const fetchErrors = [];
  const truncatedJobs = [];

  for (const job of jobs) {
    const jobId = job.id;
    const jobName = typeof job.name === 'string' ? job.name : '';
    const agentId = typeof job.agentId === 'string' ? job.agentId : '';
    const enabled = Boolean(job.enabled);

    try {
      const raw = runOpenclaw(['cron', 'runs', '--id', jobId, '--limit', '200']);
      const payload = parseJsonOrJsonLines(raw, `cron runs ${jobId}`);
      const entries = extractRunEntries(payload);
      const total = isRecord(payload) ? numberOrUndefined(payload.total) : undefined;
      const hasMore = isRecord(payload) ? Boolean(payload.hasMore) : false;

      if (hasMore || (typeof total === 'number' && total > entries.length)) {
        truncatedJobs.push({
          jobId,
          jobName,
          captured: entries.length,
          total: total ?? entries.length,
        });
      }

      for (const entry of entries) {
        if (!isRecord(entry)) {
          continue;
        }

        runs.push({
          ...entry,
          jobId: typeof entry.jobId === 'string' ? entry.jobId : jobId,
          jobName: typeof entry.jobName === 'string' ? entry.jobName : jobName,
          agentId: typeof entry.agentId === 'string' ? entry.agentId : agentId,
          enabled: typeof entry.enabled === 'boolean' ? entry.enabled : enabled,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fetchErrors.push({ jobId, jobName, message });
    }
  }

  runs.sort((left, right) => runSortKey(right) - runSortKey(left));

  const payload = {
    generatedAt: Date.now(),
    totalJobs: jobs.length,
    fetchedJobs: jobs.length - fetchErrors.length,
    runs,
    fetchErrors,
    truncatedJobs,
  };

  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

main();
