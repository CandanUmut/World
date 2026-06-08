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

// A sink that also carries UVs (for textured building walls).
function makeSinkUV() {
  return { pos: [], nor: [], col: [], uv: [] };
}
function pushTriUV(s, ax, ay, az, bx, by, bz, cx, cy, cz, color,
                   au, av, bu, bv, cu, cv) {
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
  s.uv.push(au, av, bu, bv, cu, cv);
}
function sinkUVToBuffers(s) {
  if (!s.pos.length) return null;
  return {
    positions: new Float32Array(s.pos),
    normals: new Float32Array(s.nor),
    colors: new Float32Array(s.col),
    uvs: new Float32Array(s.uv),
  };
}

// ---------------------------------------------------------------------------
// Per-feature builders.
// ---------------------------------------------------------------------------

// Facade texture footprint in meters (one repeat of the window atlas).
const FACADE_M_X = 16; // window columns per repeat
const FACADE_M_Y = 14; // floors per repeat

/**
 * Extrude a polygon ring (local x,z): flat roof cap into `roofSink` (vertex
 * color only) and textured walls into `wallSink` (with UVs so a tiling window
 * facade aligns to real-world meters). `uOff` phase-shifts the window pattern
 * per building so no two facades line up.
 */
function extrudeRingSplit(wallSink, roofSink, lx, lz, base, top, color, roofColor, uOff) {
  const n = lx.length;
  if (n < 3) return;
  // Roof cap.
  const flat = new Array(n * 2);
  for (let i = 0; i < n; i++) { flat[i * 2] = lx[i]; flat[i * 2 + 1] = lz[i]; }
  const tris = earcut(flat, null, 2);
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i], b = tris[i + 1], c = tris[i + 2];
    pushTri(roofSink, lx[a], top, lz[a], lx[b], top, lz[b], lx[c], top, lz[c], roofColor);
  }
  // Walls with running-perimeter U and height V.
  const vb = base / FACADE_M_Y, vt = top / FACADE_M_Y;
  let u = uOff;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = lx[i], az = lz[i], bx = lx[j], bz = lz[j];
    const segLen = Math.hypot(bx - ax, bz - az);
    const ua = u / FACADE_M_X, ub2 = (u + segLen) / FACADE_M_X;
    pushTriUV(wallSink, ax, base, az, bx, base, bz, bx, top, bz, color, ua, vb, ub2, vb, ub2, vt);
    pushTriUV(wallSink, ax, base, az, bx, top, bz, ax, top, az, color, ua, vb, ub2, vt, ua, vt);
    u += segLen;
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

/** Minimum building height kept at each LOD (distance) tier. */
const LOD_MIN_HEIGHT = [0, 0, 14, 30, 50];

/** Signed area of a local ring (x,z). */
function ringArea(lx, lz) {
  let a = 0;
  for (let i = 0, j = lx.length - 1; i < lx.length; j = i++) {
    a += (lx[j] + lx[i]) * (lz[j] - lz[i]);
  }
  return a / 2;
}
/** Point-in-polygon (local x,z), ray cast. */
function pointInRing(px, pz, lx, lz) {
  let inside = false;
  for (let i = 0, j = lx.length - 1; i < lx.length; j = i++) {
    if ((lz[i] > pz) !== (lz[j] > pz) &&
        px < ((lx[j] - lx[i]) * (pz - lz[i])) / (lz[j] - lz[i]) + lx[i]) {
      inside = !inside;
    }
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Top-level: build all meshes for a tile.
// ---------------------------------------------------------------------------
export function buildTileMeshes(payload, mcx, mcy, opts = {}) {
  const { lod = 0, maxBuildings = 2200, maxTrees = 420 } = opts;
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
  // Collect tree-eligible polygons (local rings) while filling ground.
  const treeAreas = [];
  const addFillsTrees = (polys, kind) => {
    for (const f of polys || []) {
      const color = groundColor(kind, f.klass);
      const y = 0.02;
      const wooded = kind === 'park' ||
        ['wood', 'forest', 'grass', 'meadow', 'park', 'garden', 'recreation_ground'].includes(f.klass);
      for (const ring of f.rings) {
        const { lx, lz } = ringToLocal(ring);
        fillRing(ground, lx, lz, y, color);
        if (wooded) treeAreas.push({ lx, lz });
      }
    }
  };
  addFills(payload.landuse, 'landuse');
  addFillsTrees(payload.landcover, 'landcover');
  addFillsTrees(payload.parks, 'park');
  addFills(payload.water, 'water');

  // --- trees: density-sample inside wooded/park polygons ---
  const trees = sampleTrees(treeAreas, maxTrees);

  // --- roads (sorted by width so wide roads draw first / underneath) ---
  const roads = makeSink();
  const sortedRoads = (payload.roads || [])
    .filter((r) => r.klass !== 'rail') // skip rail clutter for now
    .sort((a, b) => roadStyle(b.klass).w - roadStyle(a.klass).w);
  // Road centerlines for gameplay (traffic, streetlights, labels): packed
  // points + per-road meta. Drivable classes only.
  const DRIVABLE = new Set(['motorway', 'trunk', 'primary', 'secondary',
    'tertiary', 'minor', 'residential', 'service', 'living_street', 'unclassified']);
  const roadPts = [];
  const roadMeta = [];
  for (const r of sortedRoads) {
    const st = roadStyle(r.klass);
    const { lx, lz } = ringToLocal(r.pts);
    ribbon(roads, lx, lz, st.w / 2, 0.07, st.c);
    if (lod <= 1 && DRIVABLE.has(r.klass) && lx.length >= 2) {
      const start = roadPts.length / 2;
      for (let i = 0; i < lx.length; i++) roadPts.push(lx[i], lz[i]);
      roadMeta.push({ klass: r.klass, oneway: !!r.oneway, w: st.w, start, count: lx.length });
    }
  }
  // Intersection nodes: drivable road vertices shared by >=3 incidences.
  let nodes = null;
  if (roadMeta.length) {
    const counts = new Map();
    for (const r of roadMeta) {
      for (let i = r.start; i < r.start + r.count; i++) {
        const key = `${Math.round(roadPts[i * 2])},${Math.round(roadPts[i * 2 + 1])}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    const ns = [];
    for (const [key, c] of counts) {
      if (c < 3) continue;
      const [x, z] = key.split(',');
      ns.push(+x, +z);
      if (ns.length / 2 >= 60) break;
    }
    if (ns.length) nodes = new Float32Array(ns);
  }
  const roadGraph = roadMeta.length
    ? { pts: new Float32Array(roadPts), meta: roadMeta, nodes }
    : null;

  // --- buildings (LOD: drop short buildings on far tiles; cap to tallest N) ---
  const walls = makeSinkUV();
  const roofs = makeSink();
  const minH = LOD_MIN_HEIGHT[Math.min(lod, LOD_MIN_HEIGHT.length - 1)];
  let blds = (payload.buildings || []).filter((b) => !b.hide3d && (b.height || 8) >= minH);
  if (blds.length > maxBuildings) {
    blds = blds.sort((a, b) => (b.height || 0) - (a.height || 0)).slice(0, maxBuildings);
  }
  // Footprints for collision are only needed on near tiles (where the car is).
  const emitFootprints = lod <= 1;
  const footCoords = [];
  const footSizes = [];

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
      const uOff = rand01(seed * 2.3) * FACADE_M_X;
      extrudeRingSplit(walls, roofs, lx, lz, base, top, color, roofColor, uOff);
      if (emitFootprints && lx.length >= 3) {
        footSizes.push(lx.length);
        for (let i = 0; i < lx.length; i++) footCoords.push(lx[i], lz[i]);
      }
      seed += 1;
    }
  }

  const footprints = footSizes.length
    ? { coords: new Float32Array(footCoords), sizes: new Uint16Array(footSizes) }
    : null;

  // --- labels (names): places, POIs/shops, street names ---
  let labels = null;
  if (lod <= 2) {
    const o = { x: 0, z: 0 };
    const ls = [];
    for (const p of payload.places || []) {
      if (!p.name) continue;
      toLocal(p.mx, p.my, o);
      ls.push({ x: o.x, z: o.z, name: p.name, kind: 'place', rank: placeRank(p.klass) });
    }
    for (const p of payload.pois || []) {
      if (!p.name) continue;
      toLocal(p.mx, p.my, o);
      ls.push({ x: o.x, z: o.z, name: p.name, kind: poiKind(p.klass), rank: 6 });
    }
    for (const r of payload.roadNames || []) {
      if (!r.name || !r.pts || r.pts.length < 4) continue;
      const mid = (Math.floor(r.pts.length / 4)) * 2; // middle vertex
      toLocal(r.pts[mid], r.pts[mid + 1], o);
      ls.push({ x: o.x, z: o.z, name: r.name, kind: 'street', rank: 8 });
    }
    ls.sort((a, b) => a.rank - b.rank);
    if (ls.length) labels = ls.slice(0, 48);
  }

  return {
    center: { mcx, mcy },
    ground: sinkToBuffers(ground),
    roads: sinkToBuffers(roads),
    buildingsWalls: sinkUVToBuffers(walls),
    buildingsRoofs: sinkToBuffers(roofs),
    trees: trees && trees.length ? trees : null,
    footprints,
    roadGraph,
    labels,
  };
}

function placeRank(klass) {
  switch (klass) {
    case 'city': return 0;
    case 'town': return 1;
    case 'suburb': case 'borough': return 2;
    case 'neighbourhood': case 'quarter': return 3;
    case 'village': case 'hamlet': return 4;
    default: return 5;
  }
}
function poiKind(klass) {
  if (['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'food'].includes(klass)) return 'food';
  if (['shop', 'supermarket', 'convenience', 'clothing_store', 'mall', 'department_store'].includes(klass)) return 'shop';
  if (['hospital', 'police', 'fire_station', 'school', 'university'].includes(klass)) return 'civic';
  return 'poi';
}

/**
 * Density-sample tree positions inside wooded/park rings. Returns a flat
 * Float32Array of [x, z, scale] triples (tile-local meters).
 */
function sampleTrees(areas, maxTrees) {
  const SPACING = 16; // ~1 tree per 16x16 m of green
  const out = [];
  let seed = 7;
  for (const a of areas) {
    if (out.length / 3 >= maxTrees) break;
    const { lx, lz } = a;
    if (lx.length < 3) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < lx.length; i++) {
      if (lx[i] < minX) minX = lx[i];
      if (lx[i] > maxX) maxX = lx[i];
      if (lz[i] < minZ) minZ = lz[i];
      if (lz[i] > maxZ) maxZ = lz[i];
    }
    const area = Math.abs(ringArea(lx, lz));
    let n = Math.min(140, Math.floor(area / (SPACING * SPACING)));
    let attempts = 0;
    while (n > 0 && attempts < n * 6 && out.length / 3 < maxTrees) {
      attempts++;
      const px = minX + rand01(seed++) * (maxX - minX);
      const pz = minZ + rand01(seed++) * (maxZ - minZ);
      if (!pointInRing(px, pz, lx, lz)) continue;
      const scale = 0.8 + rand01(seed++) * 0.9;
      out.push(px, pz, scale);
      n--;
    }
  }
  return new Float32Array(out);
}

// ---------------------------------------------------------------------------
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}
