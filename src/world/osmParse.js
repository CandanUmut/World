/**
 * Classify Overpass elements and derive render attributes (building heights,
 * road widths/colors, water/landuse categories). Real OSM tags decide what
 * things are; this module turns tags into numbers the renderers can use.
 */

/** Parse an OSM height-ish tag ("12", "12 m", "12.5m") to metres, or null. */
function parseMeters(v) {
  if (!v) return null;
  const m = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(m) ? m : null;
}

const METERS_PER_LEVEL = 3.2;

export function buildingHeights(tags = {}) {
  let height = parseMeters(tags.height);
  if (height == null && tags['building:levels']) {
    const levels = parseFloat(tags['building:levels']);
    if (Number.isFinite(levels)) height = levels * METERS_PER_LEVEL;
  }
  if (height == null) height = 8; // sensible default ≈ small building

  let base = parseMeters(tags.min_height);
  if (base == null && tags['building:min_level']) {
    const lvl = parseFloat(tags['building:min_level']);
    if (Number.isFinite(lvl)) base = lvl * METERS_PER_LEVEL;
  }
  if (base == null) base = 0;

  return { height: Math.max(height, base + 2), base };
}

// Road class → { width (m), color rgba, order }. Unlisted highways get a default.
const ROAD_STYLES = {
  motorway: { width: 14, color: [0.95, 0.55, 0.25, 1] },
  trunk: { width: 12, color: [0.95, 0.6, 0.3, 1] },
  primary: { width: 10, color: [0.98, 0.82, 0.45, 1] },
  secondary: { width: 8, color: [0.98, 0.9, 0.6, 1] },
  tertiary: { width: 6.5, color: [0.95, 0.95, 0.85, 1] },
  residential: { width: 5, color: [0.92, 0.92, 0.92, 1] },
  service: { width: 3.5, color: [0.85, 0.85, 0.85, 1] },
  living_street: { width: 4.5, color: [0.9, 0.9, 0.9, 1] },
  pedestrian: { width: 4, color: [0.8, 0.78, 0.85, 1] },
  footway: { width: 2, color: [0.78, 0.7, 0.62, 1] },
  path: { width: 1.6, color: [0.74, 0.66, 0.56, 1] },
  cycleway: { width: 2.2, color: [0.7, 0.8, 0.95, 1] },
  track: { width: 2.6, color: [0.78, 0.72, 0.6, 1] },
};
const DEFAULT_ROAD = { width: 4, color: [0.88, 0.88, 0.88, 1] };

export function roadStyle(tags = {}) {
  return ROAD_STYLES[tags.highway] ?? DEFAULT_ROAD;
}

/** Is this element a water body? */
export function isWater(tags = {}) {
  return (
    tags.natural === 'water' ||
    tags.waterway === 'riverbank' ||
    tags.water != null
  );
}

/** Land-use categories we scatter vegetation into, with target tree density. */
const VEG_DENSITY = {
  // trees per km² (capped later)
  forest: 1400,
  wood: 1400,
  park: 350,
  garden: 250,
  grass: 80,
  meadow: 60,
  recreation_ground: 120,
  cemetery: 150,
  orchard: 900,
  farmland: 0,
};

export function vegetationDensity(tags = {}) {
  const key =
    (tags.natural === 'wood' && 'wood') ||
    (tags.landuse && VEG_DENSITY[tags.landuse] != null && tags.landuse) ||
    (tags.leisure && VEG_DENSITY[tags.leisure] != null && tags.leisure) ||
    null;
  return key ? VEG_DENSITY[key] : 0;
}

/** Greenish tint for a vegetation/landuse polygon (for an optional ground fill). */
export function landuseColor(tags = {}) {
  if (tags.natural === 'wood' || tags.landuse === 'forest') return [0.20, 0.38, 0.18, 0.5];
  if (tags.leisure === 'park' || tags.leisure === 'garden') return [0.28, 0.5, 0.24, 0.45];
  if (tags.landuse === 'grass' || tags.landuse === 'meadow') return [0.34, 0.52, 0.28, 0.4];
  if (tags.landuse === 'farmland' || tags.landuse === 'orchard') return [0.55, 0.5, 0.28, 0.35];
  return null;
}
