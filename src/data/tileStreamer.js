import { tileRing, tileKey } from './tiles.js';

const MAX_LOD = 4;

/**
 * Streams the ring of tiles around the player with distance-based LOD. Each
 * tile's LOD equals its Chebyshev distance from the center tile (clamped):
 * near tiles are built in full, far tiles only keep their tall buildings, so
 * the skyline reads at a distance for a fraction of the geometry. When a tile
 * crosses an LOD boundary as the player moves, it is rebuilt at the new tier.
 *
 * Owns a small pool of decoder workers, requests nearest-first, caps in-flight
 * work, and drops tiles that leave the radius. Geography-based, so it is
 * unaffected by floating-origin rebases.
 */
export function createTileStreamer({ url, z, workers = 2, maxInFlight = 6, onTile, onDrop, onReady }) {
  const pool = [];
  for (let i = 0; i < workers; i++) {
    const w = new Worker(new URL('../workers/tileWorker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => handleMessage(e.data);
    w.postMessage({ type: 'init', url });
    pool.push(w);
  }
  let rr = 0;
  let readyCount = 0;
  let ready = false;

  const want = new Map();      // key -> desired lod
  const have = new Map();      // key -> rendered lod
  const inflight = new Map();  // key -> { id, lod }
  const meta = new Map();      // requestId -> { key, lod }
  let queue = [];
  let nextId = 1;

  function handleMessage(msg) {
    if (msg.type === 'ready') {
      if (++readyCount === pool.length) { ready = true; onReady?.(msg); pump(); }
      return;
    }
    if (msg.type === 'error') { console.warn('[tiles] worker error', msg.error); return; }
    if (msg.type !== 'tile') return;

    const m = meta.get(msg.id);
    meta.delete(msg.id);
    if (!m) { pump(); return; }
    const { key, lod } = m;

    // Clear in-flight only if this response is the current request for the key.
    const inf = inflight.get(key);
    if (inf && inf.id === msg.id) inflight.delete(key);

    // Discard stale results (tile dropped or LOD changed since requested).
    if (want.get(key) !== lod) { pump(); return; }
    if (!msg.ok) { pump(); return; }

    if (have.has(key)) onDrop?.(key); // replacing an existing LOD
    have.set(key, lod);
    if (!msg.empty) onTile?.(msg);
    pump();
  }

  function pump() {
    while (ready && inflight.size < maxInFlight && queue.length) {
      const t = queue.shift();
      if (want.get(t.key) !== t.lod) continue;
      if (have.get(t.key) === t.lod) continue;
      const inf = inflight.get(t.key);
      if (inf && inf.lod === t.lod) continue;
      const id = nextId++;
      inflight.set(t.key, { id, lod: t.lod });
      meta.set(id, { key: t.key, lod: t.lod });
      pool[rr++ % pool.length].postMessage({ type: 'tile', id, z: t.z, x: t.x, y: t.y, lod: t.lod });
    }
  }

  /** Recompute the wanted set + LODs around lon/lat and reconcile. */
  function update(lon, lat, radius) {
    const ring = tileRing(lon, lat, z, radius);
    const next = new Map();
    for (const t of ring) next.set(tileKey(t.z, t.x, t.y), Math.min(t.dist, MAX_LOD));

    // Drop tiles no longer wanted.
    for (const key of have.keys()) {
      if (!next.has(key)) { have.delete(key); onDrop?.(key); }
    }
    want.clear();
    for (const [k, v] of next) want.set(k, v);

    // Rebuild the request queue (nearest-first), skipping satisfied tiles.
    queue = [];
    for (const t of ring) {
      const key = tileKey(t.z, t.x, t.y);
      const lod = next.get(key);
      if (have.get(key) === lod) continue;
      const inf = inflight.get(key);
      if (inf && inf.lod === lod) continue;
      queue.push({ key, z: t.z, x: t.x, y: t.y, lod });
    }
    pump();
  }

  function dispose() { pool.forEach((w) => w.terminate()); }

  return {
    update, dispose,
    get ready() { return ready; },
    stats: () => ({ want: want.size, loaded: have.size, pending: inflight.size }),
  };
}
