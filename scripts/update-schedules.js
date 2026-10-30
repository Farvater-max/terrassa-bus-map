#!/usr/bin/env node
import { discoverGtfsUrls, fetchGtfs } from '../src/gtfs/source.js';
import { readShapes } from '../src/gtfs/geometry.js';
import { transformGtfs } from '../src/gtfs/transform.js';
import { upsertFeeds } from '../src/storage/supabaseFeeds.js';

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--no-summer') options.noSummer = true;
    else if (arg === '--borrow-shapes') options.borrowShapes = true;
    else if (arg.startsWith('--')) options[arg.slice(2)] = argv[++i];
  }
  return options;
}

async function updateSchedules() {
  const options = parseArgs(process.argv.slice(2));
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

  if (!archives.main) {
    console.warn('The main archive was not downloaded. Supabase was left unchanged, so the map will keep using the current database data.');
    return;
  }

  let geometry;
  try {
    geometry = readShapes(archives.main);
  } catch (error) {
    console.warn(`Could not read the main archive (${error.message}). Supabase was left unchanged, so the current data remains available.`);
    return;
  }
  if (!geometry.length && options.borrowShapes && archives.summer) {
    geometry = readShapes(archives.summer);
  }
  console.log('Route geometry:', geometry.length ? 'available' : 'unavailable (straight lines)', `(${geometry.length} shapes)`);

  const now = new Date();
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const feeds = [];
  for (const [id, label] of [['main', 'Основное'], ['summer', 'Летнее']]) {
    if (!archives[id]) continue;
    let feed;
    try {
      feed = transformGtfs(archives[id], id, label, geometry);
    } catch (error) {
      console.warn(`Could not parse the "${id}" archive: ${error.message}`);
      if (id === 'main') {
        console.warn('Supabase was left unchanged; the current data remains available.');
        return;
      }
      continue;
    }

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

  if (!feeds.length) {
    console.warn('No schedules could be built. Supabase was left unchanged.');
    return;
  }

  await upsertFeeds(feeds, {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
    updatedAt: now,
  });
  console.log(`Supabase: upserted ${feeds.length} schedule feeds.`);
}

updateSchedules().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
