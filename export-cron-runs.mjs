#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object';
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

function extractRuns(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ['runs', 'data', 'list', 'items']) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  return [];
}

function parseJsonLoose(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    throw new Error('Command returned empty output.');
  }

  try {
    return JSON.parse(text);
  } catch (initialError) {
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    const start =
      firstBrace >= 0 && firstBracket >= 0
        ? Math.min(firstBrace, firstBracket)
        : firstBrace >= 0
          ? firstBrace
          : firstBracket;

    if (start > 0) {
      return JSON.parse(text.slice(start));
    }

    throw initialError;
  }
}

function trimOutput(...parts) {
  const text = parts
    .flatMap((part) => (typeof part === 'string' ? [part.trim()] : []))
    .filter(Boolean)
    .join('\n');

  if (!text) {
    return 'No output.';
  }

  return text.length > 400 ? `${text.slice(0, 397)}...` : text;
}

function loadJobIds(jobsPayload) {
  const ids = [];
  for (const job of extractJobs(jobsPayload)) {
    if (isRecord(job) && typeof job.id === 'string' && job.id) {
      ids.push(job.id);
    }
  }
  return ids;
}

function fetchRunsForJob(jobId) {
  const result = spawnSync('openclaw', ['cron', 'runs', '--id', jobId, '--json'], { encoding: 'utf8' });

  if (result.error) {
    return { error: result.error.message };
  }

  if (result.status !== 0) {
    return {
      error: trimOutput(result.stderr, result.stdout, `exit code ${result.status}`),
    };
  }

  try {
    const payload = parseJsonLoose(result.stdout);
    return { runs: extractRuns(payload) };
  } catch (error) {
    return {
      error: trimOutput(error instanceof Error ? error.message : String(error), result.stdout),
    };
  }
}

async function writeSnapshot(outputPath, payload) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  const [jobsPath, outputPath] = process.argv.slice(2);
  if (!jobsPath || !outputPath) {
    throw new Error('Usage: node export-cron-runs.mjs <cron-jobs.json> <cron-runs.json>');
  }

  const jobsPayload = JSON.parse(await readFile(jobsPath, 'utf8'));
  const jobIds = loadJobIds(jobsPayload);
  const runsByJobId = {};
  const errorsByJobId = {};
  let jobsSucceeded = 0;

  for (const jobId of jobIds) {
    const result = fetchRunsForJob(jobId);
    if (result.error) {
      errorsByJobId[jobId] = result.error;
      continue;
    }

    runsByJobId[jobId] = result.runs;
    jobsSucceeded += 1;
  }

  await writeSnapshot(outputPath, {
    generatedAt: Math.floor(Date.now() / 1000),
    available: jobsSucceeded > 0,
    jobsChecked: jobIds.length,
    jobsSucceeded,
    runsByJobId,
    errorsByJobId,
  });

  console.log(`Wrote: ${outputPath}`);
}

main().catch(async (error) => {
  const [, outputPath] = process.argv.slice(2);

  if (outputPath) {
    await writeSnapshot(outputPath, {
      generatedAt: Math.floor(Date.now() / 1000),
      available: false,
      jobsChecked: 0,
      jobsSucceeded: 0,
      runsByJobId: {},
      errorsByJobId: {},
      globalError: error instanceof Error ? error.message : String(error),
    });
    console.error(`Wrote fallback snapshot: ${outputPath}`);
    process.exitCode = 0;
    return;
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
