/**
 * Fast OSM vector-tile source — the primary world-geometry pipeline.
 *
 * Reads Mapbox Vector Tiles (MVT) either from a baked PMTiles archive (static,
 * range-requested — host it as a GitHub Release asset ≤2GB, a /public file, or
 * any range-capable host) or from an XYZ MVT URL template. Tiles are decoded
 * client-side and adapted into the same simple "way" shape the existing
 * builders (buildings/roads/water/trees/landuse) already consume, so the
 * renderers are reused unchanged.
 *
 * Schema: OpenMapTiles (what Planetiler/Protomaps produce). Layer + field names
 * below follow that schema.
 */
import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import { config } from '../config.js';

export const VECTOR_ZOOM = 14; // OpenMapTiles carries buildings/detail at z14

// --- tile math ------------------------------------------------------------
export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

function tilePixelToLonLat(z, x, y, px, py, extent) {
  const n = 2 ** z;
  const wx = x + px / extent;
  const wy = y + py / extent;
  const lon = (wx / n) * 360 - 180;
  const k = Math.PI - (2 * Math.PI * wy) / n;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k)));
  return { lon, lat };
}

// Signed area (tile coords) to tell outer rings (>0) from holes (<0).
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
  }
  return a / 2;
}

// --- OpenMapTiles → OSM-ish tags adapter ----------------------------------
const ROAD_CLASS = {
  motorway: 'motorway',
  trunk: 'trunk',
  primary: 'primary',
  secondary: 'secondary',
  tertiary: 'tertiary',
  minor: 'residential',
  service: 'service',
  street: 'residential',
  path: 'path',
  track: 'track',
  cycleway: 'cycleway',
  footway: 'footway',
  pedestrian: 'pedestrian',
};

function tagsFor(layerName, p) {
  switch (layerName) {
    case 'building':
      return { building: 'yes', height: p.render_height, min_height: p.render_min_height };
    case 'transportation': {
      const hw = ROAD_CLASS[p.class];
      return hw ? { highway: hw } : null;
    }
    case 'water':
      return { natural: 'water' };
    case 'landcover': {
      if (p.class === 'wood' || p.subclass === 'wood' || p.subclass === 'forest')
        return { natural: 'wood' };
      if (p.class === 'grass' || p.class === 'meadow') return { landuse: 'grass' };
      if (p.class === 'farmland') return { landuse: 'farmland' };
      return { landuse: 'grass' };
    }
    case 'park':
      return { leisure: 'park' };
    case 'landuse': {
      const urban = ['residential', 'commercial', 'industrial', 'retail', 'suburb', 'neighbourhood'];
      if (urban.includes(p.class)) return { landuse: p.class };
      if (p.class === 'cemetery') return { landuse: 'cemetery' };
      if (p.class === 'wood' || p.class === 'forest') return { natural: 'wood' };
      return { landuse: p.class || 'grass' };
    }
    default:
      return null;
  }
}

// Which layers we pull, and whether they're polygon or line features.
const WANTED = ['building', 'transportation', 'water', 'landcover', 'landuse', 'park'];

/**
 * Decode raw MVT bytes into normalized "ways":
 *   { type:'way', id, tags, geometry:[{lon,lat}], _poly:boolean }
 */
function decodeTile(buf, z, x, y) {
  const tile = new VectorTile(new Protobuf(new Uint8Array(buf)));
  const ways = [];
  let idc = (z * 1e7 + x * 1e3 + y) * 1000;

  for (const layerName of WANTED) {
    const layer = tile.layers[layerName];
    if (!layer) continue;
    const extent = layer.extent || 4096;

    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const tags = tagsFor(layerName, feature.properties || {});
      if (!tags) continue;
      const geom = feature.loadGeometry(); // arrays of {x,y} in tile coords
      const isPoly = feature.type === 3;

      if (isPoly) {
        // Emit one way per outer ring (holes ignored for simplicity).
        for (const ring of geom) {
          if (ring.length < 4 || ringArea(ring) <= 0) continue;
          ways.push({
            type: 'way',
            id: idc++,
            tags,
            _poly: true,
            geometry: ring.map((pt) => tilePixelToLonLat(z, x, y, pt.x, pt.y, extent)),
          });
        }
      } else {
        for (const line of geom) {
          if (line.length < 2) continue;
          ways.push({
            type: 'way',
            id: idc++,
            tags,
            _poly: false,
            geometry: line.map((pt) => tilePixelToLonLat(z, x, y, pt.x, pt.y, extent)),
          });
        }
      }
    }
  }
  return ways;
}

/**
 * Create the active vector source from config, or null if none configured.
 * @returns {{getTile:(z,x,y)=>Promise<Array|null>, name:string}|null}
 */
export function createVectorSource() {
  const { pmtilesUrl, mvtUrlTemplate } = config.vector;

  if (pmtilesUrl) {
    const archive = new PMTiles(pmtilesUrl);
    return {
      name: `PMTiles (${shortUrl(pmtilesUrl)})`,
      zoom: VECTOR_ZOOM,
      // Clamp our working zoom to what the archive actually contains.
      async init() {
        try {
          const h = await archive.getHeader();
          this.zoom = Math.min(VECTOR_ZOOM, h.maxZoom);
        } catch (err) {
          console.warn('[vectorTiles] could not read PMTiles header', err?.message);
        }
        return this.zoom;
      },
      async getTile(z, x, y) {
        const entry = await archive.getZxy(z, x, y);
        if (!entry || !entry.data) return null;
        return decodeTile(entry.data, z, x, y);
      },
    };
  }

  if (mvtUrlTemplate) {
    return {
      name: `Vector tiles (${shortUrl(mvtUrlTemplate)})`,
      zoom: VECTOR_ZOOM,
      async init() {
        return this.zoom;
      },
      async getTile(z, x, y) {
        const url = mvtUrlTemplate
          .replace('{z}', z)
          .replace('{x}', x)
          .replace('{y}', y);
        const res = await fetch(url);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`MVT HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        return decodeTile(buf, z, x, y);
      },
    };
  }

  return null; // caller falls back to Overpass small-area path
}

function shortUrl(u) {
  try {
    return new URL(u, window.location.href).host || u;
  } catch {
    return u;
  }
}
