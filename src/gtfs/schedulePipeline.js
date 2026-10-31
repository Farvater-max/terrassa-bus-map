import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { discoverGtfsUrls, fetchGtfs } from './source.js';
import { routeFeedGeometry } from './routing.js';
import { createOsmBusRouterForFeeds } from './osmBusRouter.js';
import { validatePreparedFeeds, validatePreparedStage } from './scheduleStage.js';
import { upsertFeeds } from '../storage/supabaseFeeds.js';

const STAGE_VERSION = 1;
const defaultDependencies = {
  discoverGtfsUrls,
  fetchGtfs,
  readShapes: async (...args) => (await import('./geometry.js')).readShapes(...args),
  transformGtfs: async (...args) => (await import('./transform.js')).transformGtfs(...args),
  routeFeedGeometry,
  createOsmBusRouterForFeeds,
  validatePreparedFeeds,
  validatePreparedStage,
  upsertFeeds,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
  now: () => new Date(),
  log: console,
};

export async function prepareSchedules({ options, runId, stagePath, dependencies = {} }) {
  const deps = { ...defaultDependencies, ...dependencies };
  const { log } = deps;
  await deps.rm(stagePath, { force: true });
  const urls = options.main && (options.summer || options.noSummer)
    ? {}
    : await deps.discoverGtfsUrls();
  const sources = {
    main: options.main || urls.main,
    summer: options.noSummer ? null : (options.summer || urls.summer),
  };
  const archives = {};

  for (const [id, source] of Object.entries(sources)) {
    if (!source) continue;
    try {
      archives[id] = await deps.fetchGtfs(source);
    } catch (error) {
      log.warn(`Could not download the "${id}" archive: ${error.message}`);
    }
  }
  if (!archives.main) throw new Error('The main GTFS archive is unavailable; prepared schedules were not written.');

  let geometry;
  try {
    geometry = await deps.readShapes(archives.main);
  } catch (error) {
    throw new Error(`Could not read route shapes from the main GTFS file: ${error.message}`, { cause: error });
  }
  if (!geometry.length && options.borrowShapes && archives.summer) {
    try {
      geometry = await deps.readShapes(archives.summer);
    } catch (error) {
      log.warn(`Could not read shapes from the summer GTFS file; continuing without borrowed shapes: ${error.message}`);
    }
  }
  log.log('GTFS route geometry:', geometry.length ? 'available' : 'unavailable', `(${geometry.length} shapes)`);

  const now = deps.now();
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const feeds = [];
  for (const [id, label] of [['main', 'Основное'], ['summer', 'Летнее']]) {
    if (!archives[id]) continue;
    let feed;
    try {
      feed = await deps.transformGtfs(archives[id], id, label, geometry);
    } catch (error) {
      if (id === 'main') throw new Error(`Could not prepare the main GTFS feed: ${error.message}`, { cause: error });
      log.warn(`Could not prepare the summer GTFS feed; it will be left unchanged in Supabase: ${error.message}`);
      continue;
    }
    const endDate = feed.cal.map(calendar => calendar[3]).sort().at(-1) || '';
    if (id === 'summer' && endDate < today) {
      log.warn(`The summer archive is outdated (valid through ${endDate}) and will be skipped.`);
      continue;
    }
    if (id === 'main' && endDate < today) {
      log.warn(`The main archive has expired (valid through ${endDate}); the map will use its weekday schedule.`);
    }
    feeds.push(feed);
    log.log(`${id}: ${feed.trips.length} trips`);
  }
  if (!feeds.length) throw new Error('No GTFS feeds were prepared.');

  log.log('Loading OpenStreetMap road data for the GTFS stop area...');
  let router = null;
  try {
    router = await deps.createOsmBusRouterForFeeds(feeds);
    log.log('OSM bus graph:', router.stats);
  } catch (error) {
    log.warn(`Could not load the OSM bus graph; route shapes from GTFS will be kept where available: ${error.message}`);
  }

  const reports = feeds.map(feed => ({ id: feed.id, ...deps.routeFeedGeometry(feed, { router, log }) }));
  deps.validatePreparedFeeds(feeds, reports);
  const stage = {
    formatVersion: STAGE_VERSION,
    runId,
    preparedAt: now.toISOString(),
    router: 'osm-bus-dijkstra',
    reports,
    feeds,
  };
  await deps.mkdir(dirname(stagePath), { recursive: true });
  const temporaryPath = `${stagePath}.${process.pid}.tmp`;
  try {
    await deps.writeFile(temporaryPath, JSON.stringify(stage));
    await deps.rename(temporaryPath, stagePath);
  } finally {
    await deps.rm(temporaryPath, { force: true });
  }
  log.log(`Preparation complete: ${feeds.length} feed(s), ${reports.reduce((sum, report) => sum + report.routed, 0)} stop sequences.`);
  log.log('Prepared schedules staged locally:', stagePath);
  log.log('SCHEDULE_RUN_ID:', runId);
  return stage;
}

export async function persistSchedules({ stagePath, runId, environment = process.env, dependencies = {} }) {
  const deps = { ...defaultDependencies, ...dependencies };
  if (!runId) throw new Error('Set --run-id (or SCHEDULE_RUN_ID) matching the preparation stage.');
  const stage = deps.validatePreparedStage(JSON.parse(await deps.readFile(stagePath, 'utf8')), runId);
  await deps.upsertFeeds(stage.feeds, {
    url: environment.SUPABASE_URL,
    serviceKey: environment.SUPABASE_SERVICE_KEY,
    updatedAt: new Date(stage.preparedAt),
  });
  deps.log.log(`Supabase: persisted ${stage.feeds.length} fully prepared feed(s) from run ${stage.runId}.`);
}
