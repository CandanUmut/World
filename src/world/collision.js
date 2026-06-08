/**
 * Building-footprint collision for the car.
 *
 * The worker emits footprint polygons (tile-local x,z) only for NEAR tiles
 * (lod <= 1), so collision exists in a tight ring around the player and costs
 * nothing far away — same spawn-near/despawn-far discipline as the streaming.
 *
 * Each tile stores its polygons in the TILE-LOCAL frame plus a reference to its
 * rendered Group. The Group's position is the tile's live world offset and is
 * kept correct across floating-origin rebases, so we never have to re-bake
 * collision on rebase: world point -> tile-local is just `point - group.position`.
 *
 * Broadphase is a per-tile uniform grid; the narrow phase is a forgiving
 * circle-vs-polygon push that lets the car slide along walls instead of sticking.
 */

const CELL = 48; // broadphase cell size (m); must exceed the car radius

let GEN = 0; // bumped each resolve() to dedupe polygons spanning multiple cells

export function createCollision() {
  const tiles = new Map(); // key -> { group, polys, grid, stamp }

  function addTile(key, footprints, group) {
    if (!footprints || !footprints.sizes || !footprints.sizes.length) return;
    const { coords, sizes } = footprints;
    const polys = [];
    let read = 0;
    for (let s = 0; s < sizes.length; s++) {
      const n = sizes[s];
      const c = new Float32Array(n * 2);
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < n; i++) {
        const x = coords[read++], z = coords[read++];
        c[i * 2] = x; c[i * 2 + 1] = z;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      polys.push({ c, n, minX, minZ, maxX, maxZ });
    }

    // Bucket polygons into a uniform grid by AABB.
    const grid = new Map();
    for (let p = 0; p < polys.length; p++) {
      const po = polys[p];
      const cx0 = Math.floor(po.minX / CELL), cx1 = Math.floor(po.maxX / CELL);
      const cz0 = Math.floor(po.minZ / CELL), cz1 = Math.floor(po.maxZ / CELL);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const gk = cx * 73856093 ^ cz * 19349663;
          let b = grid.get(gk);
          if (!b) grid.set(gk, (b = []));
          b.push(p);
        }
      }
    }

    tiles.set(key, { group, polys, grid, stamp: new Int32Array(polys.length) });
  }

  function dropTile(key) { tiles.delete(key); }

  /**
   * Resolve a circle (world x,z + radius) against nearby footprints. Writes the
   * accumulated push delta and outward surface normal into `out` and returns it.
   */
  function resolve(px, pz, radius, out) {
    out.hit = false; out.dx = 0; out.dz = 0; out.nx = 0; out.nz = 0;
    const gen = ++GEN;
    for (const t of tiles.values()) {
      const lx = px - t.group.position.x;
      const lz = pz - t.group.position.z;
      const cx = Math.floor(lx / CELL), cz = Math.floor(lz / CELL);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gz = cz - 1; gz <= cz + 1; gz++) {
          const bucket = t.grid.get(gx * 73856093 ^ gz * 19349663);
          if (!bucket) continue;
          for (let bi = 0; bi < bucket.length; bi++) {
            const pi = bucket[bi];
            if (t.stamp[pi] === gen) continue; // already tested this resolve
            t.stamp[pi] = gen;
            const po = t.polys[pi];
            if (lx < po.minX - radius || lx > po.maxX + radius ||
                lz < po.minZ - radius || lz > po.maxZ + radius) continue;
            circlePoly(lx, lz, radius, po, out);
          }
        }
      }
    }
    if (out.hit) {
      const nl = Math.hypot(out.nx, out.nz);
      if (nl > 1e-5) { out.nx /= nl; out.nz /= nl; }
    }
    return out;
  }

  /**
   * Nearby footprint rectangles for the minimap, as [dx, dz, halfX, halfZ]
   * quads relative to (ox, oz) in world meters. Capped so it never costs.
   */
  function snapshot(ox, oz, range, cap = 700) {
    const out = [];
    const r2 = range * range;
    for (const t of tiles.values()) {
      const gpx = t.group.position.x, gpz = t.group.position.z;
      const lox = ox - gpx, loz = oz - gpz; // origin in tile-local
      if (lox < -range - 2000 || lox > range + 2000) continue; // cheap tile reject
      for (let p = 0; p < t.polys.length; p++) {
        const po = t.polys[p];
        const cxl = (po.minX + po.maxX) * 0.5, czl = (po.minZ + po.maxZ) * 0.5;
        const dx = cxl - lox, dz = czl - loz;
        if (dx * dx + dz * dz > r2) continue;
        out.push(dx, dz, (po.maxX - po.minX) * 0.5, (po.maxZ - po.minZ) * 0.5);
        if (out.length >= cap * 4) return out;
      }
    }
    return out;
  }

  return {
    addTile, dropTile, resolve, snapshot,
    get tileCount() { return tiles.size; },
  };
}

// --- narrow phase ---------------------------------------------------------

function circlePoly(lx, lz, radius, po, acc) {
  const c = po.c, n = po.n;
  let bestD2 = Infinity, bx = 0, bz = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = c[i * 2], az = c[i * 2 + 1];
    const ex = c[j * 2] - ax, ez = c[j * 2 + 1] - az;
    const len2 = ex * ex + ez * ez || 1;
    let tt = ((lx - ax) * ex + (lz - az) * ez) / len2;
    if (tt < 0) tt = 0; else if (tt > 1) tt = 1;
    const cpx = ax + ex * tt, cpz = az + ez * tt;
    const dx = lx - cpx, dz = lz - cpz;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; bx = cpx; bz = cpz; }
  }
  const inside = pointInPoly(lx, lz, c, n);
  const d = Math.sqrt(bestD2);
  if (inside) {
    // Center is inside the footprint: shove it out through the nearest wall.
    let nx = bx - lx, nz = bz - lz;
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const pen = d + radius;
    acc.dx += nx * pen; acc.dz += nz * pen;
    acc.nx -= nx; acc.nz -= nz; // outward = away from the wall
    acc.hit = true;
  } else if (d < radius) {
    let nx = lx - bx, nz = lz - bz;
    const l = d || 1; nx /= l; nz /= l;
    const pen = radius - d;
    acc.dx += nx * pen; acc.dz += nz * pen;
    acc.nx += nx; acc.nz += nz;
    acc.hit = true;
  }
}

function pointInPoly(px, pz, c, n) {
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = c[i * 2], zi = c[i * 2 + 1];
    const xj = c[j * 2], zj = c[j * 2 + 1];
    if ((zi > pz) !== (zj > pz) &&
        px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
