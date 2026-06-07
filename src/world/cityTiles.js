import * as THREE from 'three';

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

    tiles.set(key, group);
    root.add(group);
  }

  function dropTile(key) {
    const group = tiles.get(key);
    if (!group) return;
    root.remove(group);
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    tiles.delete(key);
  }

  return { addTile, dropTile, get count() { return tiles.size; } };
}
