import { readFile } from 'node:fs/promises';

const CKAN_URL = 'https://opendata.terrassa.cat/api/3/action/package_show?id=parades-bus';
const FALLBACK_URLS = {
  main: 'https://nap.transportes.gob.es/api/Fichero/download/1175',
  summer: 'https://opendata.terrassa.cat/dataset/b3e576c8-481f-4446-bafe-41258f7ec0ae/resource/0002bb95-34cd-4e23-95c0-9c0747d66443/download/gtfs-tmsae_estiu.zip',
};

export class GtfsSourceError extends Error {
  constructor(message, { source, status, cause } = {}) {
    super(message, { cause });
    this.name = 'GtfsSourceError';
    this.source = source;
    this.status = status;
  }
}

export async function fetchGtfs(source, { fetchImpl = fetch, readFileImpl = readFile } = {}) {
  if (!/^https?:/.test(source)) {
    let bytes;
    try {
      bytes = new Uint8Array(await readFileImpl(source));
    } catch (cause) {
      throw new GtfsSourceError(`Could not read GTFS file "${source}": ${cause.message}`, { source, cause });
    }
    if (!bytes.length) throw new GtfsSourceError(`GTFS file "${source}" is empty.`, { source });
    return bytes;
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    Accept: 'application/zip,application/octet-stream,application/json,text/html;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ca,es;q=0.9,en;q=0.8',
  };
  const url = new URL(source);
  if (url.hostname === 'nap.transportes.gob.es') {
    const apiKey = process.env.NAP_API_KEY;
    if (!apiKey) throw new Error('Set NAP_API_KEY (a GitHub Actions secret) to download GTFS from NAP.');
    headers.ApiKey = apiKey;
  }
  let response;
  try {
    response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(120000), redirect: 'follow' });
  } catch (cause) {
    throw new GtfsSourceError(`GTFS request failed for ${source}: ${cause.message}`, { source, cause });
  }
  if (!response.ok) {
    throw new GtfsSourceError(
      `GTFS request returned HTTP ${response.status} (server: ${response.headers.get('server') || '?'}).`,
      { source, status: response.status },
    );
  }
  let bytes;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (cause) {
    throw new GtfsSourceError(`Could not read the GTFS response body from ${source}: ${cause.message}`, { source, cause });
  }
  if (!bytes.length) throw new GtfsSourceError(`GTFS request returned an empty file from ${source}.`, { source });
  return bytes;
}

export async function discoverGtfsUrls() {
  const urls = { ...FALLBACK_URLS };
  try {
    const response = await fetchGtfs(CKAN_URL);
    const resources = JSON.parse(new TextDecoder().decode(response)).result.resources;
    // The portal still lists the main resource as dated 2025; the current feed comes from NAP.
    for (const resource of resources) {
      if (/estiu/i.test(`${resource.name || ''}${resource.url || ''}`)) urls.summer = resource.url;
    }
  } catch (error) {
    console.error('CKAN API is unavailable; using fallback URLs:', error.message);
  }
  return urls;
}
