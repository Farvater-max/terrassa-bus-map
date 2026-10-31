#!/usr/bin/env node
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { discoverGtfsUrls, fetchGtfs } from '../src/gtfs/source.js';
import { readShapes } from '../src/gtfs/geometry.js';
import { transformGtfs } from '../src/gtfs/transform.js';
import { routeFeedGeometry } from '../src/gtfs/routing.js';
import { createOsmBusRouterForFeeds } from '../src/gtfs/osmBusRouter.js';
import { upsertFeeds } from '../src/storage/supabaseFeeds.js';

const STAGE_FILE = '.staging/prepared-schedules.json';
const STAGE_VERSION = 1;

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

function validatePreparedFeeds(feeds, reports) {
  if (!Array.isArray(feeds) || !feeds.length) throw new Error('The prepared file contains no feeds.');
  if (!feeds.some(feed => feed.id === 'main')) throw new Error('The prepared file has no main schedule feed.');
  if (!Array.isArray(reports)) throw new Error('The prepared file has no routing reports.');
  if (reports.length !== feeds.length) throw new Error('The prepared file has a mismatched number of routing reports.');

  const feedIds = new Set();
  const reportIds = new Set();
  for (const report of reports) {
    if (!report.id || reportIds.has(report.id)) throw new Error('The prepared file has duplicate or missing routing report ids.');
    reportIds.add(report.id);
  }
  for (const feed of feeds) {
    if (feedIds.has(feed.id)) throw new Error(`Duplicate feed id in prepared data: ${feed.id}.`);
    feedIds.add(feed.id);
    for (const key of ['routes', 'stops', 'pats', 'shapes', 'trips', 'cal', 'cd']) {
      if (!Array.isArray(feed[key])) throw new Error(`Feed ${feed.id} is missing its ${key} data.`);
    }
    if (!feed.pats.length || !feed.shapes.length) throw new Error(`Feed ${feed.id} has no routed patterns or shapes.`);

    for (const [patternIndex, pattern] of feed.pats.entries()) {
      const [sequence, , shapeIndex, stopShapeIndexes] = pattern;
      if (!Array.isArray(sequence) || sequence.length < 2) {
        throw new Error(`Feed ${feed.id} pattern ${patternIndex} has an invalid stop sequence.`);
      }
      if (!Number.isInteger(shapeIndex) || !feed.shapes[shapeIndex]) {
        throw new Error(`Feed ${feed.id} pattern ${patternIndex} has no routed shape.`);
      }
      const shape = feed.shapes[shapeIndex];
      if (!Array.isArray(shape) || shape.length < 2) {
        throw new Error(`Feed ${feed.id} pattern ${patternIndex} has an empty shape.`);
      }
      if (!Array.isArray(stopShapeIndexes) || stopShapeIndexes.length !== sequence.length) {
        throw new Error(`Feed ${feed.id} pattern ${patternIndex} has invalid stop-to-shape indexes.`);
      }

      for (let stopIndex = 0; stopIndex < sequence.length; stopIndex++) {
        const stop = feed.stops[sequence[stopIndex]];
        const shapePointIndex = stopShapeIndexes[stopIndex];
        if (!stop || !Number.isInteger(shapePointIndex) || !shape[shapePointIndex]) {
          throw new Error(`Feed ${feed.id} pattern ${patternIndex} references a missing stop or shape point.`);
        }
        const [latitude, longitude] = shape[shapePointIndex];
        if (Math.abs(latitude - stop[1]) > 0.00002 || Math.abs(longitude - stop[2]) > 0.00002) {
          throw new Error(`Feed ${feed.id} pattern ${patternIndex} does not anchor stop "${stop[0]}" to its shape.`);
        }
      }

      for (const point of shape) {
        if (!Array.isArray(point) || point.length < 2
          || !Number.isFinite(point[0]) || !Number.isFinite(point[1])
          || point[0] < -90 || point[0] > 90 || point[1] < -180 || point[1] > 180) {
          throw new Error(`Feed ${feed.id} pattern ${patternIndex} contains invalid route coordinates.`);
        }
      }
    }

    const report = reports.find(item => item.id === feed.id);
    if (!report || report.failed !== 0 || report.skipped !== 0
      || report.routed !== report.uniqueSequences) {
      throw new Error(`Feed ${feed.id} did not route every unique stop sequence successfully.`);
    }
  }
}

function validateStage(stage, expectedRunId) {
  if (stage?.formatVersion !== STAGE_VERSION) throw new Error('Unsupported prepared schedules file version.');
  if (!stage.runId || stage.runId !== expectedRunId) {
    throw new Error(`Prepared schedules run id mismatch (expected ${expectedRunId}, found ${stage.runId || 'none'}).`);
  }
  if (!Number.isFinite(Date.parse(stage.preparedAt))) throw new Error('Prepared schedules file has no valid preparation time.');
  validatePreparedFeeds(stage.feeds, stage.reports);
  return stage;
}

async function prepareSchedules({ options, runId, stagePath }) {
  await rm(stagePath, { force: true });
  const urls = options.main && (options.summer || options.noSummer)
    ? {}
    : await discoverGtfsUrls();
  const sources = {
    main: options.main || urls.main,
    summer: options.noSummer ? null : (options.summer || urls.summer),
  };
  const archives = {};

  for (const [id, source] of Object.entries(sources)) {
    if (!source) continue;
    try {
      archives[id] = await fetchGtfs(source);
    } catch (error) {
      console.warn(`Could not download the "${id}" archive: ${error.message}`);
    }
  }
  if (!archives.main) throw new Error('The main GTFS archive is unavailable; prepared schedules were not written.');

  let geometry = readShapes(archives.main);
  if (!geometry.length && options.borrowShapes && archives.summer) geometry = readShapes(archives.summer);
  console.log('GTFS route geometry:', geometry.length ? 'available' : 'unavailable', `(${geometry.length} shapes)`);

  const now = new Date();
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const feeds = [];
  for (const [id, label] of [['main', 'Основное'], ['summer', 'Летнее']]) {
    if (!archives[id]) continue;
    const feed = transformGtfs(archives[id], id, label, geometry);
    const endDate = feed.cal.map(calendar => calendar[3]).sort().at(-1) || '';
    if (id === 'summer' && endDate < today) {
      console.warn(`The summer archive is outdated (valid through ${endDate}) and will be skipped.`);
      continue;
    }
    if (id === 'main' && endDate < today) {
      console.warn(`The main archive has expired (valid through ${endDate}); the map will use its weekday schedule.`);
    }
    feeds.push(feed);
    console.log(`${id}: ${feed.trips.length} trips`);
  }
  if (!feeds.length) throw new Error('No GTFS feeds were prepared.');

  console.log('Loading OpenStreetMap road data for the GTFS stop area...');
  const router = await createOsmBusRouterForFeeds(feeds);
  console.log('OSM bus graph:', router.stats);

  const reports = [];
  for (const feed of feeds) {
    const report = routeFeedGeometry(feed, { router });
    if (!report.routed || report.failed || report.skipped
      || report.routed !== report.uniqueSequences) {
      throw new Error(`Feed ${feed.id} routing is incomplete; refusing to stage partial schedules.`);
    }
    reports.push({ id: feed.id, ...report });
  }

  validatePreparedFeeds(feeds, reports);
  const stage = {
    formatVersion: STAGE_VERSION,
    runId,
    preparedAt: now.toISOString(),
    router: 'osm-bus-dijkstra',
    reports,
    feeds,
  };
  await mkdir(dirname(stagePath), { recursive: true });
  const temporaryPath = `${stagePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(stage));
    await rename(temporaryPath, stagePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  console.log(`Preparation complete: ${feeds.length} feed(s), ${reports.reduce((sum, report) => sum + report.routed, 0)} stop sequences.`);
  console.log('Prepared schedules staged locally:', stagePath);
  console.log('SCHEDULE_RUN_ID:', runId);
  return stage;
}

async function persistSchedules({ stagePath, runId }) {
  if (!runId) throw new Error('Set --run-id (or SCHEDULE_RUN_ID) matching the preparation stage.');
  const stage = validateStage(JSON.parse(await readFile(stagePath, 'utf8')), runId);
  await upsertFeeds(stage.feeds, {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
    updatedAt: new Date(stage.preparedAt),
  });
  console.log(`Supabase: persisted ${stage.feeds.length} fully prepared feed(s) from run ${stage.runId}.`);
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
