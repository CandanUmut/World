/**
 * Procedural city-geometry generator. Pure functions, no Three.js — runs in
 * the decoder worker. Turns sparse OSM features into stylized, vertex-colored
 * meshes returned as flat Float32 arrays (non-indexed, so flat shading reads
 * as crisp facets). The MAIN-THREAD code just wraps these in BufferGeometry.
 *
 * Everything is built in a TILE-LOCAL frame (meters relative to the tile
 * center) so coordinates stay small and float-safe; the main thread positions
 * each tile group against the floating-origin anchor.
 */
import earcut from 'earcut';

const R = 6378137;
const DEG = Math.PI / 180;

/** A simple deterministic hash -> [0,1) from a number. */
function rand01(seed) {
  let n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// ---------------------------------------------------------------------------
// Color palettes (linear-ish sRGB triples 0..1).
// ---------------------------------------------------------------------------
const BUILDING_PALETTE = [
  [0.80, 0.74, 0.66], // sandstone
  [0.72, 0.56, 0.46], // brick
  [0.66, 0.67, 0.70], // concrete
  [0.58, 0.61, 0.66], // cool stone
  [0.83, 0.80, 0.74], // pale
  [0.52, 0.54, 0.58], // dark concrete
];
const GLASS = [0.50, 0.62, 0.73];

function buildingColor(b, top, seed) {
  let base;
  if (b.colour && b.colour[0] === '#') {
    base = hexToRgb(b.colour) || BUILDING_PALETTE[0];
  } else {
    base = BUILDING_PALETTE[Math.floor(rand01(seed) * BUILDING_PALETTE.length)];
  }
  // Taller buildings trend glassy.
  const glassiness = Math.min(1, Math.max(0, (top - 45) / 120)) * 0.7;
  const jitter = 0.86 + rand01(seed * 1.7) * 0.26;
  return [
    clamp01((base[0] * (1 - glassiness) + GLASS[0] * glassiness) * jitter),
    clamp01((base[1] * (1 - glassiness) + GLASS[1] * glassiness) * jitter),
    clamp01((base[2] * (1 - glassiness) + GLASS[2] * glassiness) * jitter),
  ];
}

function groundColor(kind, klass) {
  if (kind === 'water') return [0.20, 0.43, 0.64];
  if (kind === 'park') return [0.44, 0.62, 0.34];
  switch (klass) {
    case 'wood': case 'forest': case 'grass': case 'meadow': case 'park':
    case 'recreation_ground': case 'golf_course': case 'pitch': case 'garden':
      return [0.45, 0.63, 0.36];
    case 'sand': case 'beach': return [0.86, 0.80, 0.62];
    case 'rock': case 'bare_rock': return [0.62, 0.60, 0.57];
    case 'wetland': return [0.46, 0.56, 0.46];
    case 'residential': return [0.60, 0.585, 0.55];
    case 'commercial': case 'retail': return [0.62, 0.58, 0.55];
    case 'industrial': case 'railway': return [0.56, 0.55, 0.55];
    case 'cemetery': return [0.50, 0.58, 0.45];
    default: return [0.56, 0.565, 0.55];
  }
}

const ROAD = {
  motorway: { w: 13, c: [0.30, 0.31, 0.34] },
  trunk: { w: 11, c: [0.30, 0.31, 0.34] },
  primary: { w: 9, c: [0.29, 0.30, 0.33] },
  secondary: { w: 7.5, c: [0.29, 0.30, 0.33] },
  tertiary: { w: 6.5, c: [0.30, 0.31, 0.34] },
  minor: { w: 5, c: [0.31, 0.32, 0.35] },
  residential: { w: 5, c: [0.31, 0.32, 0.35] },
  service: { w: 3.5, c: [0.33, 0.34, 0.37] },
  track: { w: 3, c: [0.45, 0.40, 0.33] },
  path: { w: 2, c: [0.52, 0.45, 0.36] },
  pedestrian: { w: 3.5, c: [0.50, 0.48, 0.45] },
};
function roadStyle(klass) { return ROAD[klass] || ROAD.minor; }

// ---------------------------------------------------------------------------
// Mesh accumulator: pushes non-indexed triangles with per-vertex color.
// ---------------------------------------------------------------------------
function makeSink() {
  return { pos: [], nor: [], col: [] };
}
function pushTri(s, ax, ay, az, bx, by, bz, cx, cy, cz, color) {
  // face normal
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  s.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  s.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  const [r, g, bl] = color;
  s.col.push(r, g, bl, r, g, bl, r, g, bl);
}
function sinkToBuffers(s) {
  if (!s.pos.length) return null;
  return {
    positions: new Float32Array(s.pos),
    normals: new Float32Array(s.nor),
    colors: new Float32Array(s.col),
  };
}

// ---------------------------------------------------------------------------
// Per-feature builders.
// ---------------------------------------------------------------------------

/** Extrude a polygon ring (local x,z) into a solid prism base..top. */
function extrudeRing(s, lx, lz, base, top, color, roofColor) {
  const n = lx.length;
  if (n < 3) return;
  // Roof cap via earcut on the 2D (x,z) outline.
  const flat = new Array(n * 2);
  for (let i = 0; i < n; i++) { flat[i * 2] = lx[i]; flat[i * 2 + 1] = lz[i]; }
  const tris = earcut(flat, null, 2);
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i], b = tris[i + 1], c = tris[i + 2];
    pushTri(s, lx[a], top, lz[a], lx[b], top, lz[b], lx[c], top, lz[c], roofColor);
  }
  // Walls.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = lx[i], az = lz[i], bx = lx[j], bz = lz[j];
    // quad (a_base, b_base, b_top, a_top) as two tris
    pushTri(s, ax, base, az, bx, base, bz, bx, top, bz, color);
    pushTri(s, ax, base, az, bx, top, bz, ax, top, az, color);
  }
}

/** Flat-fill a polygon ring at height y. */
function fillRing(s, lx, lz, y, color) {
  const n = lx.length;
  if (n < 3) return;
  const flat = new Array(n * 2);
  for (let i = 0; i < n; i++) { flat[i * 2] = lx[i]; flat[i * 2 + 1] = lz[i]; }
  const tris = earcut(flat, null, 2);
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i], b = tris[i + 1], c = tris[i + 2];
    pushTri(s, lx[a], y, lz[a], lx[b], y, lz[b], lx[c], y, lz[c], color);
  }
}

/** Build a flat ribbon along a polyline (local x,z) with miter joins. */
function ribbon(s, lx, lz, halfW, y, color) {
  const n = lx.length;
  if (n < 2) return;
  // segment unit normals
  const nx = new Array(n - 1), nz = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    let dx = lx[i + 1] - lx[i], dz = lz[i + 1] - lz[i];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    nx[i] = -dz; nz[i] = dx; // left normal
  }
  // per-vertex miter offsets
  const ox = new Array(n), oz = new Array(n);
  for (let i = 0; i < n; i++) {
    let mx, mz;
    if (i === 0) { mx = nx[0]; mz = nz[0]; }
    else if (i === n - 1) { mx = nx[n - 2]; mz = nz[n - 2]; }
    else {
      mx = nx[i - 1] + nx[i]; mz = nz[i - 1] + nz[i];
      const ml = Math.hypot(mx, mz) || 1;
      mx /= ml; mz /= ml;
      // miter length = halfW / cos(theta/2); clamp to avoid spikes
      let scale = 1 / Math.max(0.35, mx * nx[i] + mz * nz[i]);
      scale = Math.min(scale, 3);
      mx *= scale; mz *= scale;
    }
    ox[i] = mx * halfW; oz[i] = mz * halfW;
  }
  for (let i = 0; i < n - 1; i++) {
    const alx = lx[i] + ox[i], alz = lz[i] + oz[i];
    const arx = lx[i] - ox[i], arz = lz[i] - oz[i];
    const blx = lx[i + 1] + ox[i + 1], blz = lz[i + 1] + oz[i + 1];
    const brx = lx[i + 1] - ox[i + 1], brz = lz[i + 1] - oz[i + 1];
    pushTri(s, alx, y, alz, arx, y, arz, brx, y, brz, color);
    pushTri(s, alx, y, alz, brx, y, brz, blx, y, blz, color);
  }
}

// ---------------------------------------------------------------------------
// Top-level: build all meshes for a tile.
// ---------------------------------------------------------------------------
export function buildTileMeshes(payload, mcx, mcy, maxBuildings = 2200) {
  // tile-center latitude -> meters scale (cos lat correction)
  const latC = (2 * Math.atan(Math.exp(mcy / R)) - Math.PI / 2);
  const scale = Math.cos(latC);
  const toLocal = (mx, my, out) => { out.x = (mx - mcx) * scale; out.z = -(my - mcy) * scale; };

  const ringToLocal = (ring) => {
    const n = ring.length / 2;
    const lx = new Array(n), lz = new Array(n);
    const o = { x: 0, z: 0 };
    for (let i = 0; i < n; i++) { toLocal(ring[i * 2], ring[i * 2 + 1], o); lx[i] = o.x; lz[i] = o.z; }
    return { lx, lz };
  };

  // --- ground fills (landcover, landuse, park, water) merged ---
  const ground = makeSink();
  const addFills = (polys, kind) => {
    for (const f of polys || []) {
      const color = groundColor(kind, f.klass);
      const y = kind === 'water' ? 0.04 : 0.02;
      for (const ring of f.rings) {
        const { lx, lz } = ringToLocal(ring);
        fillRing(ground, lx, lz, y, color);
      }
    }
  };
  addFills(payload.landcover, 'landcover');
  addFills(payload.landuse, 'landuse');
  addFills(payload.parks, 'park');
  addFills(payload.water, 'water');

  // --- roads (sorted by width so wide roads draw first / underneath) ---
  const roads = makeSink();
  const sortedRoads = (payload.roads || [])
    .filter((r) => r.klass !== 'rail') // skip rail clutter for now
    .sort((a, b) => roadStyle(b.klass).w - roadStyle(a.klass).w);
  for (const r of sortedRoads) {
    const st = roadStyle(r.klass);
    const { lx, lz } = ringToLocal(r.pts);
    ribbon(roads, lx, lz, st.w / 2, 0.07, st.c);
  }

  // --- buildings (cap to the tallest N to bound geometry) ---
  const buildings = makeSink();
  let blds = (payload.buildings || []).filter((b) => !b.hide3d);
  if (blds.length > maxBuildings) {
    blds = blds.sort((a, b) => (b.height || 0) - (a.height || 0)).slice(0, maxBuildings);
  }
  let seed = 1;
  for (const b of blds) {
    const base = Math.max(0, b.minHeight || 0);
    const top = Math.max(base + 2.5, b.height || 8);
    for (const ring of b.rings) {
      const { lx, lz } = ringToLocal(ring);
      // drop the duplicated closing vertex if present
      const n = lx.length;
      if (n > 1 && Math.abs(lx[0] - lx[n - 1]) < 1e-6 && Math.abs(lz[0] - lz[n - 1]) < 1e-6) {
        lx.pop(); lz.pop();
      }
      const color = buildingColor(b, top, seed);
      const roofColor = [color[0] * 0.82, color[1] * 0.82, color[2] * 0.85];
      extrudeRing(buildings, lx, lz, base, top, color, roofColor);
      seed += 1;
    }
  }

  return {
    center: { mcx, mcy },
    ground: sinkToBuffers(ground),
    roads: sinkToBuffers(roads),
    buildings: sinkToBuffers(buildings),
  };
}

// ---------------------------------------------------------------------------
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}
