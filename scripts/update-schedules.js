#!/usr/bin/env node
import { resolve } from 'node:path';
import { persistSchedules, prepareSchedules } from '../src/gtfs/schedulePipeline.js';

const STAGE_FILE = '.staging/prepared-schedules.json';

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--no-summer') options.noSummer = true;
    else if (arg === '--borrow-shapes') options.borrowShapes = true;
    else if (arg === '--prepare-only') options.prepareOnly = true;
    else if (arg === '--persist-only') options.persistOnly = true;
    else if (arg.startsWith('--')) options[arg.slice(2)] = argv[++index];
  }
  return options;
}

async function updateSchedules() {
  const options = parseArgs(process.argv.slice(2));
  if (options.prepareOnly && options.persistOnly) {
    throw new Error('Use either --prepare-only or --persist-only, not both.');
  }

  const stagePath = resolve(options.stage || STAGE_FILE);
  const runId = options.runId || process.env.SCHEDULE_RUN_ID
    || `local-${Date.now()}`;

  if (options.persistOnly) {
    await persistSchedules({ stagePath, runId });
    return;
  }

  await prepareSchedules({ options, runId, stagePath });
  if (!options.prepareOnly) await persistSchedules({ stagePath, runId });
}

updateSchedules().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
