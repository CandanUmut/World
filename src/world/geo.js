/** Small geometry helpers for OSM polygons (point-in-polygon, area, scatter). */

/** Ray-casting point-in-polygon. ring = [{lon,lat}, ...]. */
export function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lon;
    const yi = ring[i].lat;
    const xj = ring[j].lon;
    const yj = ring[j].lat;
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Approximate polygon area in m² (equirectangular at the ring's latitude). */
export function ringAreaMeters(ring) {
  if (ring.length < 3) return 0;
  const latRad = (ring[0].lat * Math.PI) / 180;
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos(latRad);
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lon * mPerDegLon;
    const yi = ring[i].lat * mPerDegLat;
    const xj = ring[j].lon * mPerDegLon;
    const yj = ring[j].lat * mPerDegLat;
    a += xj * yi - xi * yj;
  }
  return Math.abs(a) / 2;
}

export function ringBounds(ring) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const p of ring) {
    if (p.lon < minLon) minLon = p.lon;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lon > maxLon) maxLon = p.lon;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  return { minLon, minLat, maxLon, maxLat };
}

/**
 * Scatter up to `count` random points inside a polygon ring (rejection sample).
 * Returns [{lon,lat}, ...].
 */
export function scatterInRing(ring, count, rng = Math.random) {
  const { minLon, minLat, maxLon, maxLat } = ringBounds(ring);
  const points = [];
  const maxAttempts = count * 12;
  let attempts = 0;
  while (points.length < count && attempts < maxAttempts) {
    attempts++;
    const lon = minLon + rng() * (maxLon - minLon);
    const lat = minLat + rng() * (maxLat - minLat);
    if (pointInRing(lon, lat, ring)) points.push({ lon, lat });
  }
  return points;
}

/** Deterministic tiny PRNG (mulberry32) so a tile scatters the same way twice. */
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
