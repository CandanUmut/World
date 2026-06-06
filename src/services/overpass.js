/**
 * Overpass API client — free OSM data for the region around the player.
 *
 * Good-citizen rules baked in:
 *  - one request in flight at a time, with a minimum gap between requests;
 *  - per-tile in-memory cache so we never re-fetch the same area;
 *  - rotate to a fallback endpoint on failure / 429 / timeout;
 *  - exponential back-off when a server signals overload.
 *
 * Callers fetch a single tile bbox at a time (see regionLoader) so we only ever
 * request what's near the camera.
 */
import { config } from '../config.js';

const endpoints = config.vector.overpassUrls;
let endpointIndex = 0;

const cache = new Map(); // tileKey -> parsed elements
let lastRequestAt = 0;
let backoffMs = 0;
const MIN_GAP_MS = 1200;

// Serialise requests through a single-slot queue to stay polite.
let chain = Promise.resolve();

function nextEndpoint() {
  endpointIndex = (endpointIndex + 1) % endpoints.length;
  return endpoints[endpointIndex];
}

/** Build the Overpass QL for a bbox (south, west, north, east). */
function buildQuery(s, w, n, e) {
  const bbox = `${s},${w},${n},${e}`;
  return `[out:json][timeout:25];
(
  way["building"](${bbox});
  way["highway"](${bbox});
  way["natural"="water"](${bbox});
  way["waterway"="riverbank"](${bbox});
  way["landuse"~"forest|grass|meadow|recreation_ground|cemetery|farmland|orchard"](${bbox});
  way["natural"="wood"](${bbox});
  way["leisure"~"park|garden|pitch|golf_course"](${bbox});
);
out body geom;`;
}

async function pace() {
  const now = Date.now();
  const wait = Math.max(lastRequestAt + MIN_GAP_MS + backoffMs - now, 0);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function doFetch(query, attempt = 0) {
  await pace();
  const url = endpoints[endpointIndex];
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query,
    });
  } catch {
    // Network/endpoint error — rotate and retry a couple of times.
    if (attempt < endpoints.length) {
      nextEndpoint();
      return doFetch(query, attempt + 1);
    }
    throw new Error('Overpass unreachable.');
  }

  if (res.status === 429 || res.status === 504) {
    backoffMs = Math.min((backoffMs || 1500) * 2, 30_000);
    nextEndpoint();
    if (attempt < 3) return doFetch(query, attempt + 1);
    throw new Error('Overpass busy (rate-limited).');
  }
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);

  // Success — relax back-off.
  backoffMs = Math.max(Math.floor(backoffMs / 2), 0);
  const json = await res.json();
  return json.elements || [];
}

/**
 * Fetch OSM elements for a tile bbox, cached by key.
 * @returns {Promise<Array>} Overpass elements with inline `geometry`.
 */
export function fetchTile(tileKey, bbox) {
  if (cache.has(tileKey)) return Promise.resolve(cache.get(tileKey));

  // Append to the serial chain so only one request runs at a time.
  const run = chain.then(async () => {
    if (cache.has(tileKey)) return cache.get(tileKey);
    const [s, w, n, e] = bbox;
    const elements = await doFetch(buildQuery(s, w, n, e));
    cache.set(tileKey, elements);
    return elements;
  });
  // Keep the chain alive even if this request fails.
  chain = run.catch(() => {});
  return run;
}

export function hasTile(tileKey) {
  return cache.has(tileKey);
}
