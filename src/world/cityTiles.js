import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeFacadeTextures } from './facades.js';

/** A shared low-poly tree (brown trunk + green foliage) for instancing. */
function makeTreeGeometry() {
  const trunk = new THREE.CylinderGeometry(0.22, 0.34, 2.4, 5).toNonIndexed();
  trunk.translate(0, 1.2, 0);
  paint(trunk, [0.36, 0.26, 0.18]);
  let foliage = new THREE.IcosahedronGeometry(2.1, 0);
  if (foliage.index) foliage = foliage.toNonIndexed();
  foliage.translate(0, 3.9, 0);
  paint(foliage, [0.32, 0.5, 0.26]);
  return mergeGeometries([trunk, foliage], false);
}
function paint(geo, [r, g, b]) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
let TREE_GEO = null;
let LAMP_GEO = null;

/**
 * Places the stylized city meshes built by the worker. Each tile is one Group
 * holding ground fills, roads, textured building WALLS (window facades), flat
 * ROOFS, instanced trees, and night streetlights. The night factor ramps the
 * window emissive and shows the streetlights so the same city reads detailed by
 * day and glows at night — all via emissive + bloom, no real point lights.
 */
export function createCityTiles(scene, origin, collision = null) {
  const root = new THREE.Group();
  origin.track(root);
  scene.add(root);

  const tiles = new Map(); // key -> { group, lamps, road }
  const fac = makeFacadeTextures();

  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide,
  });
  const roadMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    vertexColors: true, map: fac.colorTex, emissiveMap: fac.nightTex,
    emissive: 0xffffff, emissiveIntensity: 0.0,
    roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.85, metalness: 0.02, side: THREE.DoubleSide,
  });
  const treeMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, metalness: 0.0, flatShading: true,
  });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a, emissive: 0xffdca8, emissiveIntensity: 2.2,
  });
  const dummy = new THREE.Object3D();
  let nightFactor = 0;

  function treesFrom(buf) {
    if (!TREE_GEO) TREE_GEO = makeTreeGeometry();
    if (!TREE_GEO) return null;
    const count = buf.length / 3;
    const inst = new THREE.InstancedMesh(TREE_GEO, treeMat, count);
    inst.frustumCulled = false;
    for (let i = 0; i < count; i++) {
      const x = buf[i * 3], z = buf[i * 3 + 1], s = buf[i * 3 + 2];
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, (x + z) % 6.283, 0);
      dummy.scale.set(s, s * (0.9 + (z % 0.4)), s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    return inst;
  }

  // Emissive streetlight bulbs spaced along drivable roads (night only).
  function streetlightsFrom(road) {
    if (!LAMP_GEO) LAMP_GEO = new THREE.SphereGeometry(0.55, 6, 5);
    const { pts, meta } = road;
    const SPACING = 30;
    const positions = [];
    for (let m = 0; m < meta.length; m++) {
      const r = meta[m];
      if (r.w < 5) continue; // light the bigger streets only
      const side = (m & 1) ? 1 : -1;
      const off = r.w / 2 + 1.4;
      let carry = SPACING * 0.5;
      for (let i = r.start; i < r.start + r.count - 1; i++) {
        const ax = pts[i * 2], az = pts[i * 2 + 1];
        const bx = pts[(i + 1) * 2], bz = pts[(i + 1) * 2 + 1];
        let dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz);
        if (len < 1e-3) continue;
        dx /= len; dz /= len;
        const px = -dz * side * off, pz = dx * side * off; // perpendicular offset
        let t = carry;
        while (t < len) {
          positions.push(ax + dx * t + px, 5.6, az + dz * t + pz);
          t += SPACING;
        }
        carry = t - len;
        if (positions.length / 3 > 220) break;
      }
      if (positions.length / 3 > 220) break;
    }
    if (!positions.length) return null;
    const inst = new THREE.InstancedMesh(LAMP_GEO, lampMat, positions.length / 3);
    inst.frustumCulled = false;
    for (let i = 0; i < positions.length / 3; i++) {
      dummy.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.visible = nightFactor > 0.04;
    return inst;
  }

  function meshFrom(buffers, material) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(buffers.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 3));
    if (buffers.uvs) geo.setAttribute('uv', new THREE.BufferAttribute(buffers.uvs, 2));
    geo.computeBoundingSphere();
    return new THREE.Mesh(geo, material);
  }

  function addTile(msg) {
    const key = `${msg.z}/${msg.x}/${msg.y}`;
    if (tiles.has(key)) return;
    const group = new THREE.Group();

    const c = msg.center;
    const p = origin.mercToWorld(c.mcx, c.mcy);
    group.position.set(p.x, 0, p.z);

    if (msg.ground) group.add(meshFrom(msg.ground, groundMat));
    if (msg.roads) { const m = meshFrom(msg.roads, roadMat); m.renderOrder = 1; group.add(m); }
    if (msg.buildingsRoofs) group.add(meshFrom(msg.buildingsRoofs, roofMat));
    if (msg.buildingsWalls) group.add(meshFrom(msg.buildingsWalls, wallMat));
    if (msg.trees) { const t = treesFrom(msg.trees); if (t) group.add(t); }

    let lamps = null;
    if (msg.roadGraph) { lamps = streetlightsFrom(msg.roadGraph); if (lamps) group.add(lamps); }
    if (collision && msg.footprints) collision.addTile(key, msg.footprints, group);

    tiles.set(key, { group, lamps, road: msg.roadGraph || null, labels: msg.labels || null });
    root.add(group);
  }

  function dropTile(key) {
    const rec = tiles.get(key);
    if (!rec) return;
    if (collision) collision.dropTile(key);
    root.remove(rec.group);
    rec.group.traverse((o) => {
      if (o.isInstancedMesh) { o.dispose(); return; } // keep shared geometries
      if (o.geometry) o.geometry.dispose();
    });
    tiles.delete(key);
  }

  /** 0 = full day, 1 = full night: ramp window glow + show streetlights. */
  function setNight(f) {
    nightFactor = f;
    wallMat.emissiveIntensity = f * 1.7;
    const show = f > 0.04;
    for (const rec of tiles.values()) if (rec.lamps) rec.lamps.visible = show;
  }

  /** Tiles that have a road graph, for traffic/pedestrians (rebase-safe groups). */
  function roadTiles() {
    const out = [];
    for (const rec of tiles.values()) if (rec.road) out.push(rec);
    return out;
  }

  /** Tiles that carry name labels, for the label layer. */
  function labelTiles() {
    const out = [];
    for (const rec of tiles.values()) if (rec.labels) out.push(rec);
    return out;
  }

  return {
    addTile, dropTile, setNight, roadTiles, labelTiles,
    get count() { return tiles.size; },
  };
}
