/**
 * Geographic <-> game-world coordinate conversion.
 *
 * The game uses a local tangent-plane in METERS with a Y-up, right-handed
 * frame:  +X = east, +Y = up, +Z = south  (so -Z points north, and the
 * default Three.js camera, which looks down -Z, faces north).
 *
 * We project lon/lat through Web Mercator (EPSG:3857) and then correct for
 * Mercator's latitude stretch by multiplying by cos(latitude) at the scene
 * anchor — this keeps distances close to true ground meters near the player,
 * so roads and blocks aren't stretched. Good enough for a city-scale game.
 */

export const EARTH_RADIUS = 6378137; // meters (WGS84 sphere for mercator)
const DEG = Math.PI / 180;

/** lon/lat (degrees) -> raw Web-Mercator meters. */
export function lonLatToMercator(lon, lat) {
  const x = EARTH_RADIUS * lon * DEG;
  const y = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));
  return { x, y };
}

/** raw Web-Mercator meters -> lon/lat (degrees). */
export function mercatorToLonLat(x, y) {
  const lon = (x / EARTH_RADIUS) / DEG;
  const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) / DEG;
  return { lon, lat };
}

/**
 * A projection anchored at a reference lon/lat. All world coordinates are
 * meters relative to this anchor, with the cos(lat) stretch correction baked
 * in. Construct one per origin; rebase by making a new anchor.
 */
export class GeoAnchor {
  constructor(lon, lat) {
    this.lon = lon;
    this.lat = lat;
    this.scale = Math.cos(lat * DEG); // mercator -> true-ground correction
    const m = lonLatToMercator(lon, lat);
    this.mx = m.x;
    this.my = m.y;
  }

  /** lon/lat -> world {x, z} meters (east, south). */
  toWorld(lon, lat) {
    const m = lonLatToMercator(lon, lat);
    return {
      x: (m.x - this.mx) * this.scale,
      z: -(m.y - this.my) * this.scale, // north -> -Z
    };
  }

  /** world {x, z} meters -> lon/lat (degrees). */
  toLonLat(x, z) {
    const mx = x / this.scale + this.mx;
    const my = -z / this.scale + this.my;
    return mercatorToLonLat(mx, my);
  }
}
