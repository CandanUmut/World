/**
 * Streams the world's geometry around the camera: stylized land-use ground,
 * 3D buildings, roads, water and trees.
 *
 * Primary source is fast vector tiles (PMTiles archive or XYZ MVT) at a fixed
 * zoom. If no tile source is configured it falls back to the slow keyless
 * Overpass API for a *small* area only. Either way the decoded features feed the
 * same builders, and tiles are cached + unloaded by distance.
 */
import { Math as CesiumMath, createOsmBuildingsAsync } from 'cesium';
import { config, CESIUM_ION_TOKEN } from '../config.js';
import { fetchTile as fetchOverpassTile } from '../services/overpass.js';
import { createVectorSource, lonLatToTile, VECTOR_ZOOM } from '../services/vectorTiles.js';
import { buildBuildings } from './buildings.js';
import { buildRoads, buildWater, buildLanduse } from './osmVector.js';
import { buildTrees } from './trees.js';
import { throttle } from '../util/throttle.js';
import { toast } from '../ui/toast.js';

const OVERPASS_STEP = 0.012; // fallback tile size in degrees (~1.3 km)
const MAX_CONCURRENT = 5;

export async function initRegionLoader(viewer) {
  const { scene } = viewer;
  const loaded = new Map(); // key -> { prims:[], grounds:[] }
  const pending = new Set();
  let inFlight = 0;
  let warned = false;

  const source = createVectorSource();
  const useVector = !!source;
  const vectorZoom = useVector ? await source.init() : VECTOR_ZOOM;

  console.info(
    useVector
      ? `[regionLoader] vector source: ${source.name}`
      : '[regionLoader] no tile source configured — using Overpass small-area fallback.',
  );
  if (!useVector) {
    toast('No vector tiles configured — using slow Overpass fallback. See README to add a PMTiles URL.', {
      type: 'warn',
      duration: 6000,
    });
  }

  // Optional global ion buildings (kept from before).
  if (config.buildings === 'ion-osm') {
    if (CESIUM_ION_TOKEN) {
      try {
        scene.primitives.add(await createOsmBuildingsAsync());
      } catch (err) {
        console.warn('[regionLoader] ion OSM Buildings failed', err);
      }
    } else {
      console.warn('[regionLoader] buildings="ion-osm" needs VITE_CESIUM_ION_TOKEN; skipping.');
    }
  }
  const extrudeBuildings = config.buildings === 'osm';

  function radiusForAltitude(alt) {
    if (alt > 16_000) return -1;
    if (alt > 8_000) return 0;
    return 1; // 3×3 around the player
  }

  // Returns array of tile descriptors with a stable key.
  function targetTiles() {
    const carto = viewer.camera.positionCartographic;
    const r = radiusForAltitude(carto.height);
    if (r < 0) return [];
    const lon = CesiumMath.toDegrees(carto.longitude);
    const lat = CesiumMath.toDegrees(carto.latitude);
    const out = [];

    if (useVector) {
      const { x: cx, y: cy } = lonLatToTile(lon, lat, vectorZoom);
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const x = cx + dx;
          const y = cy + dy;
          out.push({ key: `${vectorZoom}/${x}/${y}`, z: vectorZoom, x, y });
        }
      }
    } else {
      const cx = Math.floor(lon / OVERPASS_STEP);
      const cy = Math.floor(lat / OVERPASS_STEP);
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const ix = cx + dx;
          const iy = cy + dy;
          out.push({
            key: `op_${ix}_${iy}`,
            bbox: [iy * OVERPASS_STEP, ix * OVERPASS_STEP, (iy + 1) * OVERPASS_STEP, (ix + 1) * OVERPASS_STEP],
          });
        }
      }
    }
    return out;
  }

  async function fetchWays(t) {
    if (useVector) return (await source.getTile(t.z, t.x, t.y)) || [];
    const elements = await fetchOverpassTile(t.key, t.bbox);
    return elements.filter((e) => e.type === 'way');
  }

  function renderWays(t, ways) {
    const prims = [];
    const grounds = [];
    const landuse = buildLanduse(scene, ways);
    if (landuse) grounds.push(scene.groundPrimitives.add(landuse));
    const water = buildWater(scene, ways);
    if (water) grounds.push(scene.groundPrimitives.add(water));
    const roads = buildRoads(scene, ways);
    if (roads) grounds.push(scene.groundPrimitives.add(roads));
    if (extrudeBuildings) {
      const b = buildBuildings(scene, ways);
      if (b) prims.push(scene.primitives.add(b));
    }
    const trees = buildTrees(scene, ways, hashKey(t.key));
    if (trees) prims.push(scene.primitives.add(trees));
    loaded.set(t.key, { prims, grounds });
  }

  function unloadTile(key) {
    const entry = loaded.get(key);
    if (!entry) return;
    for (const p of entry.prims) scene.primitives.remove(p);
    for (const g of entry.grounds) scene.groundPrimitives.remove(g);
    loaded.delete(key);
  }

  let currentWanted = new Set();

  async function loadTile(t) {
    if (loaded.has(t.key) || pending.has(t.key)) return;
    pending.add(t.key);
    inFlight++;
    try {
      const ways = await fetchWays(t);
      if (currentWanted.has(t.key) && ways.length) renderWays(t, ways);
      else if (currentWanted.has(t.key)) loaded.set(t.key, { prims: [], grounds: [] }); // empty but loaded
    } catch (err) {
      if (!warned) {
        warned = true;
        toast(
          useVector
            ? 'Map tiles failed to load — check the PMTiles/MVT URL (CORS + range requests).'
            : 'Map detail is loading slowly (Overpass is busy).',
          { type: 'warn', duration: 6000 },
        );
      }
      console.warn('[regionLoader] tile failed', t.key, err?.message);
    } finally {
      pending.delete(t.key);
      inFlight--;
      pump();
    }
  }

  // Queue of wanted-but-not-loaded tiles, throttled by MAX_CONCURRENT.
  let queue = [];
  function pump() {
    while (inFlight < MAX_CONCURRENT && queue.length) {
      const t = queue.shift();
      if (!loaded.has(t.key) && !pending.has(t.key)) loadTile(t);
    }
  }

  const update = throttle(() => {
    const tiles = targetTiles();
    currentWanted = new Set(tiles.map((t) => t.key));
    for (const key of loaded.keys()) if (!currentWanted.has(key)) unloadTile(key);
    // Nearest-first ordering keeps the area under the player sharp.
    queue = tiles.filter((t) => !loaded.has(t.key) && !pending.has(t.key));
    pump();
  }, 500);

  viewer.camera.moveEnd.addEventListener(update);
  update();
  return { update };
}

function hashKey(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return h;
}
