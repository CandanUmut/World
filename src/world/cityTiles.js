import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A shared low-poly tree (brown trunk + green foliage) for instancing. */
function makeTreeGeometry() {
  // Both must be non-indexed with matching attributes to merge.
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

/**
 * Places the stylized city meshes built by the worker. Each tile is one Group
 * (tracked by the floating origin, dropped when it leaves the radius) holding
 * up to three merged, vertex-colored meshes: ground fills, roads, buildings.
 * The worker delivers geometry in a tile-local frame; we position the group at
 * the tile center against the current anchor.
 */
export function createCityTiles(scene, origin) {
  const root = new THREE.Group();
  origin.track(root);
  scene.add(root);

  const tiles = new Map(); // key -> Group

  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide,
  });
  const roadMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const buildingMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.82, metalness: 0.02, side: THREE.DoubleSide,
  });
  const treeMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, metalness: 0.0, flatShading: true,
  });
  const dummy = new THREE.Object3D();

  function treesFrom(buf) {
    if (!TREE_GEO) TREE_GEO = makeTreeGeometry();
    if (!TREE_GEO) return null; // merge failed; skip trees gracefully
    const count = buf.length / 3;
    const inst = new THREE.InstancedMesh(TREE_GEO, treeMat, count);
    inst.frustumCulled = false; // single-tree bounds would mis-cull the spread
    for (let i = 0; i < count; i++) {
      const x = buf[i * 3], z = buf[i * 3 + 1], s = buf[i * 3 + 2];
      dummy.position.set(x, 0, z);
      dummy.rotation.y = (x + z) % 6.283;
      dummy.scale.set(s, s * (0.9 + (z % 0.4)), s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    return inst;
  }

  function meshFrom(buffers, material) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(buffers.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 3));
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
    if (msg.buildings) group.add(meshFrom(msg.buildings, buildingMat));
    if (msg.trees) { const t = treesFrom(msg.trees); if (t) group.add(t); }

    tiles.set(key, group);
    root.add(group);
  }

  function dropTile(key) {
    const group = tiles.get(key);
    if (!group) return;
    root.remove(group);
    group.traverse((o) => {
      if (o.isInstancedMesh) { o.dispose(); return; } // keep shared tree geometry
      if (o.geometry) o.geometry.dispose();
    });
    tiles.delete(key);
  }

  return { addTile, dropTile, get count() { return tiles.size; } };
}
