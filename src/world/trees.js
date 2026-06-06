/**
 * Procedural vegetation: scatter instanced tree billboards into OSM-tagged
 * vegetation polygons (forest, wood, park, …). Real data decides *where*;
 * a light procedural layer decides the look.
 *
 * Billboards are ground-clamped (cheap, no per-tree terrain sampling), batched
 * in one BillboardCollection per tile, and LOD'd via scaleByDistance so distant
 * tiles cost almost nothing.
 */
import {
  BillboardCollection,
  HeightReference,
  VerticalOrigin,
  NearFarScalar,
  Cartesian3,
} from 'cesium';
import { config } from '../config.js';
import { vegetationDensity } from './osmParse.js';
import { scatterInRing, ringAreaMeters, seededRng } from './geo.js';

// A couple of stylized tree sprites, generated once on a canvas (no asset files).
let SPRITES = null;
function treeSprites() {
  if (SPRITES) return SPRITES;
  SPRITES = [makeTreeSprite('#2f6b2a', '#244f20'), makeTreeSprite('#3a7d33', '#2c5e27'), makeTreeSprite('#4f7d2f', '#3c5f24')];
  return SPRITES;
}

function makeTreeSprite(canopy, canopyDark) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  // trunk
  g.fillStyle = '#5a3f28';
  g.fillRect(size / 2 - 3, size - 16, 6, 16);
  // canopy (layered circles for a little depth)
  const cx = size / 2;
  g.fillStyle = canopyDark;
  g.beginPath();
  g.arc(cx, size - 28, 17, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = canopy;
  g.beginPath();
  g.arc(cx - 5, size - 32, 12, 0, Math.PI * 2);
  g.arc(cx + 6, size - 30, 13, 0, Math.PI * 2);
  g.arc(cx, size - 40, 12, 0, Math.PI * 2);
  g.fill();
  return c;
}

/**
 * @param {Scene} scene
 * @param {Array} ways Overpass landuse/leisure/natural ways.
 * @param {number} tileSeed deterministic per-tile seed.
 * @returns {BillboardCollection|null}
 */
export function buildTrees(scene, ways, tileSeed) {
  if (!config.vector.enableTrees) return null;

  const sprites = treeSprites();
  const collection = new BillboardCollection({ scene });
  const cap = config.vector.maxTreesPerTile;
  let total = 0;

  for (const w of ways) {
    if (total >= cap) break;
    const density = vegetationDensity(w.tags || {});
    if (!density) continue;
    const ring = w.geometry?.filter((p) => p && p.lat != null);
    if (!ring || ring.length < 3) continue;

    const areaKm2 = ringAreaMeters(ring) / 1_000_000;
    let want = Math.round(areaKm2 * density);
    if (want <= 0) continue;
    want = Math.min(want, cap - total, 600); // per-polygon cap too

    const rng = seededRng(tileSeed + Math.abs(w.id | 0));
    const pts = scatterInRing(ring, want, rng);
    for (const p of pts) {
      const scale = 0.7 + rng() * 0.6;
      collection.add({
        position: Cartesian3.fromDegrees(p.lon, p.lat, 0),
        heightReference: HeightReference.CLAMP_TO_GROUND,
        image: sprites[(Math.random() * sprites.length) | 0],
        verticalOrigin: VerticalOrigin.BOTTOM,
        scale,
        // LOD: full size up close, fade to nothing far away.
        scaleByDistance: new NearFarScalar(200, scale, 8000, scale * 0.25),
        translucencyByDistance: new NearFarScalar(6000, 1.0, 12000, 0.0),
      });
      total++;
    }
  }

  if (total === 0) {
    collection.destroy();
    return null;
  }
  return collection;
}
