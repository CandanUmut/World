import { tileRing, tileKey } from './tiles.js';

/**
 * Streams the ring of tiles around the player. Owns a small pool of decoder
 * workers, requests missing tiles nearest-first, caps in-flight requests so a
 * burst of movement never floods the workers, and drops tiles that leave the
 * radius. Decoded results are handed to `onTile`; dropped keys to `onDrop`.
 *
 * The streamer is geography-based (it works in lon/lat + tile coords), so it
 * is unaffected by floating-origin rebases — only the consumer that places
 * meshes needs to know the current anchor.
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

  const want = new Set();        // keys we currently want loaded
  const loaded = new Set();      // keys with geometry placed
  const pending = new Map();     // key -> requestId (in flight)
  const queue = [];              // [{key,z,x,y}] waiting for a free slot
  let nextId = 1;
  const idToKey = new Map();

  function handleMessage(msg) {
    if (msg.type === 'ready') {
      if (++readyCount === pool.length) { ready = true; onReady?.(msg); pump(); }
      return;
    }
    if (msg.type === 'error') { console.warn('[tiles] worker error', msg.error); return; }
    if (msg.type !== 'tile') return;

    const key = idToKey.get(msg.id);
    idToKey.delete(msg.id);
    if (key) pending.delete(key);

    // If it left the wanted set while decoding, discard.
    if (!key || !want.has(key)) { pump(); return; }
    loaded.add(key);
    if (!msg.ok) { console.warn('[tiles] decode failed', key, msg.error); pump(); return; }
    if (!msg.empty) onTile?.(msg);
    pump();
  }

  function pump() {
    while (ready && pending.size < maxInFlight && queue.length) {
      const t = queue.shift();
      if (!want.has(t.key) || loaded.has(t.key) || pending.has(t.key)) continue;
      const id = nextId++;
      pending.set(t.key, id);
      idToKey.set(id, t.key);
      pool[rr++ % pool.length].postMessage({ type: 'tile', id, z: t.z, x: t.x, y: t.y });
    }
  }

  /** Recompute the wanted set around lon/lat and reconcile loads/drops. */
  function update(lon, lat, radius) {
    const ring = tileRing(lon, lat, z, radius);
    const nextWant = new Set(ring.map((t) => tileKey(t.z, t.x, t.y)));

    // Drop tiles no longer wanted.
    for (const key of want) {
      if (!nextWant.has(key)) {
        want.delete(key);
        if (loaded.has(key)) { loaded.delete(key); onDrop?.(key); }
        pending.delete(key); // late results will be discarded by the want check
      }
    }

    // Enqueue newly wanted tiles (nearest-first preserved by ring order).
    queue.length = 0;
    for (const t of ring) {
      const key = tileKey(t.z, t.x, t.y);
      want.add(key);
      if (!loaded.has(key) && !pending.has(key)) queue.push({ key, z: t.z, x: t.x, y: t.y });
    }
    pump();
  }

  function dispose() { pool.forEach((w) => w.terminate()); }

  return { update, dispose, get ready() { return ready; }, stats: () => ({ want: want.size, loaded: loaded.size, pending: pending.size }) };
}
