/**
 * Place search via Nominatim (free OSM geocoder, keyless, rate-limited).
 *
 * Nominatim's usage policy: max ~1 request/second, identify yourself, and cache.
 * We honour this: the UI debounces input, we serialise requests with a minimum
 * gap, cache results in-memory, and back off on HTTP 429.
 *
 * Provider is chosen via config so it stays swappable.
 */
import { config } from '../config.js';

const cache = new Map();
let lastRequestAt = 0;
let backoffUntil = 0;

const MIN_GAP_MS = 1100; // be polite: just over 1 req/sec
const ENDPOINT = config.geocoding?.nominatimUrl ?? 'https://nominatim.openstreetmap.org/search';

async function paced() {
  const now = Date.now();
  const wait = Math.max(backoffUntil - now, lastRequestAt + MIN_GAP_MS - now, 0);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

/**
 * Search for a place by name.
 * @param {string} query
 * @param {{signal?: AbortSignal}} [opts]
 * @returns {Promise<Array<{name:string, lat:number, lng:number, bbox:?number[], type:string}>>}
 */
export async function searchPlaces(query, opts = {}) {
  const q = query.trim();
  if (q.length < 2) return [];
  if (cache.has(q)) return cache.get(q);

  await paced();

  const url = new URL(ENDPOINT);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '6');
  url.searchParams.set('addressdetails', '0');

  let res;
  try {
    res = await fetch(url, {
      signal: opts.signal,
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error('Search request failed (network).');
  }

  if (res.status === 429) {
    backoffUntil = Date.now() + 5000;
    throw new Error('Search is rate-limited right now — please wait a moment.');
  }
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status}).`);

  const data = await res.json();
  const results = data.map((d) => ({
    name: d.display_name,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
    // boundingbox: [south, north, west, east]
    bbox: d.boundingbox ? d.boundingbox.map(parseFloat) : null,
    type: d.type || d.category || 'place',
  }));

  cache.set(q, results);
  return results;
}
