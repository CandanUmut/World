import { EARTH_RADIUS } from '../core/geo.js';

/**
 * Slippy-map (XYZ) tile math in Web Mercator. Tiles are square in mercator
 * meters; feature coordinates inside a vector tile are [0..extent] with y
 * pointing DOWN.
 */
const ORIGIN_SHIFT = Math.PI * EARTH_RADIUS; // 20037508.342789244
const DEG = Math.PI / 180;

/** Number of tiles per axis at a zoom. */
export const tilesPerAxis = (z) => 2 ** z;

/** Mercator extent (meters) covered by one tile at a zoom. */
export const tileMercSize = (z) => (2 * ORIGIN_SHIFT) / tilesPerAxis(z);

/** lon/lat (deg) -> fractional tile coordinates at zoom z. */
export function lonLatToTileFrac(lon, lat, z) {
  const n = tilesPerAxis(z);
  const x = ((lon + 180) / 360) * n;
  const latRad = lat * DEG;
  const y = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

/** lon/lat (deg) -> integer tile {x,y} at zoom z. */
export function lonLatToTile(lon, lat, z) {
  const f = lonLatToTileFrac(lon, lat, z);
  return { x: Math.floor(f.x), y: Math.floor(f.y), z };
}

/** Top-left (NW) corner of a tile in mercator meters. */
export function tileTopLeftMerc(z, x, y) {
  const size = tileMercSize(z);
  return {
    mx: -ORIGIN_SHIFT + x * size,
    my: ORIGIN_SHIFT - y * size,
    size,
  };
}

/** Stable string key for a tile. */
export const tileKey = (z, x, y) => `${z}/${x}/${y}`;

/**
 * The set of tiles within `radius` (Chebyshev) of the tile containing
 * lon/lat, clamped to the valid range. Returned nearest-first so the closest
 * tiles stream in before the far ring.
 */
export function tileRing(lon, lat, z, radius) {
  const c = lonLatToTile(lon, lat, z);
  const n = tilesPerAxis(z);
  const out = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      out.push({ z, x, y, dist: Math.max(Math.abs(dx), Math.abs(dy)) });
    }
  }
  out.sort((a, b) => a.dist - b.dist);
  return out;
}
