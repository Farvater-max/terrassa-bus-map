const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const ROUTABLE_HIGHWAYS = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link',
  'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified',
  'residential', 'living_street', 'service', 'road', 'track', 'pedestrian',
]);
const NON_ROAD_HIGHWAYS = new Set(['bridleway', 'corridor', 'cycleway', 'footway', 'path', 'steps']);
const GRID_CELL_DEGREES = 0.0004;
const MAX_SNAP_DISTANCE_METERS = 35;
const DEFAULT_PREFERRED_CORRIDOR_METERS = 30;
const HIGHWAY_COST_FACTOR = {
  motorway: 1,
  motorway_link: 1,
  trunk: 1,
  trunk_link: 1,
  primary: 1,
  primary_link: 1,
  secondary: 1,
  secondary_link: 1,
  tertiary: 1.04,
  tertiary_link: 1.04,
  unclassified: 1.08,
  residential: 1.12,
  living_street: 1.16,
  service: 1.18,
  road: 1.1,
  track: 1.2,
  pedestrian: 1.2,
};

function radians(value) {
  return value * Math.PI / 180;
}

function distanceMeters(a, b) {
  const latitudeDelta = radians(b[0] - a[0]);
  const longitudeDelta = radians(b[1] - a[1]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(longitudeDelta / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(haversine));
}

function distancePointToSegmentMeters(point, start, end) {
  const cosine = Math.cos(radians(point[0]));
  const startX = (start[1] - point[1]) * cosine;
  const startY = start[0] - point[0];
  const endX = (end[1] - point[1]) * cosine;
  const endY = end[0] - point[0];
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX ** 2 + deltaY ** 2;
  const fraction = lengthSquared
    ? Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / lengthSquared))
    : 0;
  return Math.hypot(startX + fraction * deltaX, startY + fraction * deltaY) * 111_000;
}

function distanceToPolylineMeters(point, polyline) {
  if (!Array.isArray(polyline) || !polyline.length) return Infinity;
  if (polyline.length === 1) return distanceMeters(point, polyline[0]);
  let nearest = Infinity;
  for (let index = 1; index < polyline.length; index++) {
    nearest = Math.min(nearest, distancePointToSegmentMeters(point, polyline[index - 1], polyline[index]));
  }
  return nearest;
}

function segmentWithinCorridor(segment, preferredShape, corridorMeters) {
  for (const fraction of [0, 0.5, 1]) {
    const point = [
      segment.start[0] + (segment.end[0] - segment.start[0]) * fraction,
      segment.start[1] + (segment.end[1] - segment.start[1]) * fraction,
    ];
    if (distanceToPolylineMeters(point, preferredShape) > corridorMeters) return false;
  }
  return true;
}

function sameCoordinate(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
}

function isAllowedAccess(value) {
  return ['yes', 'designated', 'official', 'permissive', 'destination', 'customers', 'delivery']
    .includes(String(value || '').toLowerCase());
}

function busAccess(tags) {
  // More specific OSM access tags override general restrictions such as access=no.
  for (const key of ['bus', 'psv', 'motor_vehicle', 'vehicle', 'access']) {
    if (tags[key] !== undefined) return isAllowedAccess(tags[key]);
  }
  return true;
}

function busDirection(tags) {
  const value = tags['oneway:bus']
    ?? tags['oneway:psv']
    ?? tags['oneway:vehicle']
    ?? tags.oneway
    ?? (tags.junction === 'roundabout' ? 'yes' : 'no');
  if (['-1', 'reverse'].includes(String(value).toLowerCase())) return -1;
  if (['yes', '1', 'true'].includes(String(value).toLowerCase())) return 1;
  return 0;
}

function isBusRoad(tags) {
  if (NON_ROAD_HIGHWAYS.has(tags.highway)) return false;
  if (tags.highway === 'pedestrian') {
    return ['yes', 'designated', 'permissive'].includes(tags.bus || tags.psv) && busAccess(tags);
  }
  if (!ROUTABLE_HIGHWAYS.has(tags.highway)) return false;
  return busAccess(tags);
}

function buildBounds(feeds, padding = 0.01) {
  const stops = feeds.flatMap(feed => feed.stops || []);
  if (!stops.length) throw new Error('Cannot request OSM roads without GTFS stops.');
  const latitudes = stops.map(stop => Number(stop[1])).filter(Number.isFinite);
  const longitudes = stops.map(stop => Number(stop[2])).filter(Number.isFinite);
  if (!latitudes.length || !longitudes.length) throw new Error('GTFS feeds contain no usable stop coordinates.');
  return {
    south: Math.min(...latitudes) - padding,
    west: Math.min(...longitudes) - padding,
    north: Math.max(...latitudes) + padding,
    east: Math.max(...longitudes) + padding,
  };
}

export async function fetchOsmRoadData(feeds, {
  endpoint = process.env.OSM_OVERPASS_URL || OVERPASS_ENDPOINT,
  fetchImpl = fetch,
} = {}) {
  const { south, west, north, east } = buildBounds(feeds);
  const query = `[out:json][timeout:60];way["highway"](${south},${west},${north},${east});out body;>;out skel qt;`;
  const url = new URL(endpoint);
  url.searchParams.set('data', query);
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { 'user-agent': 'terrassa-bus-map/1.0 (OSM bus route geometry)' },
      signal: AbortSignal.timeout(90000),
    });
  } catch (cause) {
    throw new Error(`OpenStreetMap Overpass request failed: ${cause.message}`, { cause });
  }
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 240);
    throw new Error(`OpenStreetMap Overpass returned HTTP ${response.status}: ${detail}`);
  }
  let data;
  try {
    data = await response.json();
  } catch (cause) {
    throw new Error(`Could not parse the OpenStreetMap road extract: ${cause.message}`, { cause });
  }
  if (!Array.isArray(data.elements)) throw new Error('OpenStreetMap returned an invalid road extract.');
  return data;
}

class MinHeap {
  #items = [];

  get size() {
    return this.#items.length;
  }

  push(item) {
    const items = this.#items;
    let index = items.push(item) - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent][0] <= item[0]) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = item;
  }

  pop() {
    const items = this.#items;
    const first = items[0];
    const last = items.pop();
    if (items.length) {
      let index = 0;
      while (true) {
        const left = 2 * index + 1;
        const right = left + 1;
        if (left >= items.length) break;
        const child = right < items.length && items[right][0] < items[left][0] ? right : left;
        if (items[child][0] >= last[0]) break;
        items[index] = items[child];
        index = child;
      }
      items[index] = last;
    }
    return first;
  }
}

export function createOsmBusRouter(data) {
  const nodes = new Map();
  const ways = [];
  for (const element of data.elements) {
    if (element.type === 'node' && Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
      nodes.set(element.id, [element.lat, element.lon]);
    } else if (element.type === 'way' && element.tags?.highway) {
      ways.push(element);
    }
  }

  const graph = new Map();
  const segmentGrid = new Map();
  const segments = [];
  const nodeCoordinates = id => nodes.get(id);
  const addEdge = (from, edge) => {
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push(edge);
  };
  const addDirectedSegment = (from, to, way) => {
    const start = nodeCoordinates(from);
    const end = nodeCoordinates(to);
    const length = distanceMeters(start, end);
    const costFactor = HIGHWAY_COST_FACTOR[way.tags.highway] ?? 1.1;
    const segment = { from, to, start, end, length, cost: length * costFactor, wayId: way.id };
    addEdge(from, { to, length, cost: segment.cost, wayId: way.id, segment });
    const segmentId = segments.push(segment) - 1;
    const minLat = Math.floor(Math.min(start[0], end[0]) / GRID_CELL_DEGREES);
    const maxLat = Math.floor(Math.max(start[0], end[0]) / GRID_CELL_DEGREES);
    const minLon = Math.floor(Math.min(start[1], end[1]) / GRID_CELL_DEGREES);
    const maxLon = Math.floor(Math.max(start[1], end[1]) / GRID_CELL_DEGREES);
    for (let latCell = minLat; latCell <= maxLat; latCell++) {
      for (let lonCell = minLon; lonCell <= maxLon; lonCell++) {
        const cell = `${latCell}:${lonCell}`;
        if (!segmentGrid.has(cell)) segmentGrid.set(cell, []);
        segmentGrid.get(cell).push(segmentId);
      }
    }
  };

  for (const way of ways) {
    if (!isBusRoad(way.tags)) continue;
    const refs = (way.nodes || []).filter(id => nodes.has(id));
    const direction = busDirection(way.tags);
    for (let index = 1; index < refs.length; index++) {
      const from = refs[index - 1];
      const to = refs[index];
      if (direction >= 0) addDirectedSegment(from, to, way);
      if (direction <= 0) addDirectedSegment(to, from, way);
    }
  }

  const nearbyRoadSegments = (stop, preferredShape, preferredCorridorMeters) => {
    const latitude = Number(stop[1]);
    const longitude = Number(stop[2]);
    const centerLat = Math.floor(latitude / GRID_CELL_DEGREES);
    const centerLon = Math.floor(longitude / GRID_CELL_DEGREES);
    const cells = Math.ceil(MAX_SNAP_DISTANCE_METERS / (GRID_CELL_DEGREES * 75_000));
    const candidates = [];
    const visited = new Set();
    for (let latCell = centerLat - cells; latCell <= centerLat + cells; latCell++) {
      for (let lonCell = centerLon - cells; lonCell <= centerLon + cells; lonCell++) {
        for (const segmentId of segmentGrid.get(`${latCell}:${lonCell}`) || []) {
          if (visited.has(segmentId)) continue;
          visited.add(segmentId);
          const segment = segments[segmentId];
          const cosine = Math.cos(radians(latitude));
          const startX = (segment.start[1] - longitude) * cosine;
          const startY = segment.start[0] - latitude;
          const endX = (segment.end[1] - longitude) * cosine;
          const endY = segment.end[0] - latitude;
          const deltaX = endX - startX;
          const deltaY = endY - startY;
          const squaredLength = deltaX ** 2 + deltaY ** 2;
          const fraction = squaredLength
            ? Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / squaredLength))
            : 0;
          const point = [
            segment.start[0] + (segment.end[0] - segment.start[0]) * fraction,
            segment.start[1] + (segment.end[1] - segment.start[1]) * fraction,
          ];
          const distance = distanceMeters([latitude, longitude], point);
          if (distance <= MAX_SNAP_DISTANCE_METERS
            && (!preferredShape || (distanceToPolylineMeters(point, preferredShape) <= preferredCorridorMeters
              && segmentWithinCorridor(segment, preferredShape, preferredCorridorMeters)))) {
            candidates.push({ segment, fraction, point, distance });
          }
        }
      }
    }
    return candidates;
  };

  const routeLegWithOptions = (fromStop, toStop, { preferredShape, preferredCorridorMeters } = {}) => {
    const sources = nearbyRoadSegments(fromStop, preferredShape, preferredCorridorMeters);
    const targets = nearbyRoadSegments(toStop, preferredShape, preferredCorridorMeters);
    if (!sources.length || !targets.length) {
      throw new Error(`No bus-accessible OSM road within ${MAX_SNAP_DISTANCE_METERS}m of ${!sources.length ? fromStop[0] : toStop[0]}.`);
    }

    const distances = new Map();
    const previous = new Map();
    const sourceByNode = new Map();
    const targetByNode = new Map();
    const queue = new MinHeap();
    for (const source of sources) {
      const candidate = {
        node: source.segment.to,
        distance: source.distance + source.segment.cost * (1 - source.fraction),
        prefix: [source.point, source.segment.end],
      };
      if (candidate.distance >= (distances.get(candidate.node) ?? Infinity)) continue;
      distances.set(candidate.node, candidate.distance);
      sourceByNode.set(candidate.node, candidate);
      queue.push([candidate.distance, candidate.node]);
    }
    for (const target of targets) {
      const candidate = {
        node: target.segment.from,
        distance: target.distance + target.segment.cost * target.fraction,
        suffix: [target.point],
      };
      if (!targetByNode.has(candidate.node)) targetByNode.set(candidate.node, []);
      targetByNode.get(candidate.node).push(candidate);
    }

    let bestTarget;
    let bestTotal = Infinity;
    let directPath;
    for (const source of sources) {
      for (const target of targets) {
        if (source.segment !== target.segment || target.fraction < source.fraction) continue;
        const total = source.distance
          + source.segment.cost * (target.fraction - source.fraction)
          + target.distance;
        if (total >= bestTotal) continue;
        bestTotal = total;
        directPath = [
          [Number(fromStop[1]), Number(fromStop[2])],
          source.point,
          target.point,
          [Number(toStop[1]), Number(toStop[2])],
        ];
      }
    }

    if (directPath) return directPath.filter((coordinate, index) => index === 0 || !sameCoordinate(coordinate, directPath[index - 1]));

    while (queue.size) {
      const [distance, node] = queue.pop();
      if (distance !== distances.get(node)) continue;
      if (distance >= bestTotal) break;
      for (const target of targetByNode.get(node) || []) {
        const total = distance + target.distance;
        if (total < bestTotal) {
          bestTotal = total;
          bestTarget = target;
        }
      }
      for (const edge of graph.get(node) || []) {
        if (preferredShape && !segmentWithinCorridor(edge.segment, preferredShape, preferredCorridorMeters)) continue;
        const nextDistance = distance + edge.cost;
        if (nextDistance >= (distances.get(edge.to) ?? Infinity)) continue;
        distances.set(edge.to, nextDistance);
        previous.set(edge.to, node);
        sourceByNode.set(edge.to, sourceByNode.get(node));
        queue.push([nextDistance, edge.to]);
      }
    }
    if (!bestTarget) {
      throw new Error(`No directed OSM bus route found between ${fromStop[0]} and ${toStop[0]}.`);
    }

    const nodeIds = [bestTarget.node];
    while (previous.has(nodeIds[0])) nodeIds.unshift(previous.get(nodeIds[0]));
    const source = sourceByNode.get(nodeIds[0]);
    const coordinates = [
      [Number(fromStop[1]), Number(fromStop[2])],
      ...source.prefix,
      ...nodeIds.slice(1).map(id => nodes.get(id)),
      ...bestTarget.suffix,
      [Number(toStop[1]), Number(toStop[2])],
    ];
    return coordinates.filter((coordinate, index) => (
      index === 0
      || Math.abs(coordinate[0] - coordinates[index - 1][0]) > 1e-7
      || Math.abs(coordinate[1] - coordinates[index - 1][1]) > 1e-7
    ));
  };

  const routeLeg = (fromStop, toStop, options = {}) => {
    const preferredShape = options.preferredShape?.length >= 2 ? options.preferredShape : null;
    const preferredCorridorMeters = options.preferredCorridorMeters ?? DEFAULT_PREFERRED_CORRIDOR_METERS;
    return routeLegWithOptions(fromStop, toStop, { preferredShape, preferredCorridorMeters });
  };

  return {
    routeLeg,
    stats: { nodes: nodes.size, ways: ways.length, routableNodes: graph.size, directedSegments: segments.length },
  };
}

export async function createOsmBusRouterForFeeds(feeds, options = {}) {
  const data = await fetchOsmRoadData(feeds, options);
  return createOsmBusRouter(data);
}
