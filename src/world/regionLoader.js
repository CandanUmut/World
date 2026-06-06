/**
 * Streams OSM world detail around the camera: 3D buildings, roads, water and
 * procedural trees. Loads only the tiles near the player, caches them, and
 * unloads distant ones to bound memory — fetching only what's needed keeps us
 * polite to the free Overpass service.
 */
import { Math as CesiumMath, createOsmBuildingsAsync } from 'cesium';
import { config, CESIUM_ION_TOKEN } from '../config.js';
import { fetchTile } from '../services/overpass.js';
import { buildBuildings } from './buildings.js';
import { buildRoads, buildWater } from './osmVector.js';
import { buildTrees } from './trees.js';
import { throttle } from '../util/throttle.js';
import { toast } from '../ui/toast.js';

const STEP = 0.012; // tile size in degrees (~1.3 km)

function tileKey(ix, iy) {
  return `${ix}_${iy}`;
}
function tileBbox(ix, iy) {
  // [south, west, north, east]
  return [iy * STEP, ix * STEP, (iy + 1) * STEP, (ix + 1) * STEP];
}

export async function initRegionLoader(viewer) {
  const { scene } = viewer;
  const loaded = new Map(); // key -> { prims:[], grounds:[] }
  const pending = new Set();
  let warned = false;
  const useOverpassBuildings = config.buildings === 'osm-overpass';

  // ion OSM Buildings path (global tileset, only with a free token).
  if (config.buildings === 'ion-osm') {
    if (CESIUM_ION_TOKEN) {
      try {
        const tileset = await createOsmBuildingsAsync();
        scene.primitives.add(tileset);
      } catch (err) {
        console.warn('[regionLoader] ion OSM Buildings failed', err);
      }
    } else {
      console.warn('[regionLoader] buildings="ion-osm" needs VITE_CESIUM_ION_TOKEN; skipping.');
    }
  }

  function radiusForAltitude(alt) {
    if (alt > 18_000) return -1; // too high: load nothing
    if (alt > 6_000) return 0; // just the center tile
    if (alt > 2_500) return 1; // 3x3
    return 1; // keep 3x3 close-up (dense cities are heavy)
  }

  function targetTiles() {
    const carto = viewer.camera.positionCartographic;
    const alt = carto.height;
    const r = radiusForAltitude(alt);
    if (r < 0) return [];
    const lon = CesiumMath.toDegrees(carto.longitude);
    const lat = CesiumMath.toDegrees(carto.latitude);
    const cx = Math.floor(lon / STEP);
    const cy = Math.floor(lat / STEP);
    const tiles = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) tiles.push([cx + dx, cy + dy]);
    }
    return tiles;
  }

  function unloadTile(key) {
    const entry = loaded.get(key);
    if (!entry) return;
    for (const p of entry.prims) scene.primitives.remove(p);
    for (const g of entry.grounds) scene.groundPrimitives.remove(g);
    loaded.delete(key);
  }

  async function loadTile(ix, iy) {
    const key = tileKey(ix, iy);
    if (loaded.has(key) || pending.has(key)) return;
    pending.add(key);
    try {
      const elements = await fetchTile(key, tileBbox(ix, iy));
      // The camera may have moved far away while we waited — drop if no longer wanted.
      if (!stillWanted(ix, iy)) {
        pending.delete(key);
        return;
      }
      const ways = elements.filter((e) => e.type === 'way');

      const prims = [];
      const grounds = [];

      if (useOverpassBuildings) {
        const b = buildBuildings(scene, ways);
        if (b) prims.push(scene.primitives.add(b));
      }
      const roads = buildRoads(scene, ways);
      if (roads) grounds.push(scene.groundPrimitives.add(roads));
      const water = buildWater(scene, ways);
      if (water) grounds.push(scene.groundPrimitives.add(water));
      const trees = buildTrees(scene, ways, (ix * 73856093) ^ (iy * 19349663));
      if (trees) prims.push(scene.primitives.add(trees));

      loaded.set(key, { prims, grounds });
    } catch (err) {
      if (!warned) {
        warned = true;
        toast('Map detail is loading slowly (free Overpass service is busy).', { type: 'warn' });
      }
      console.warn('[regionLoader] tile failed', key, err?.message);
    } finally {
      pending.delete(key);
    }
  }

  let currentWanted = new Set();
  function stillWanted(ix, iy) {
    return currentWanted.has(tileKey(ix, iy));
  }

  const update = throttle(() => {
    const tiles = targetTiles();
    currentWanted = new Set(tiles.map(([x, y]) => tileKey(x, y)));

    // Unload tiles that are no longer wanted.
    for (const key of loaded.keys()) {
      if (!currentWanted.has(key)) unloadTile(key);
    }
    // Load missing wanted tiles.
    for (const [ix, iy] of tiles) loadTile(ix, iy);
  }, 700);

  viewer.camera.moveEnd.addEventListener(update);
  update();

  return { update };
}
