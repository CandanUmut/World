import * as THREE from 'three';

/**
 * Phase 1 visualization. Proves the decoded OSM features are correct,
 * world-space data: it draws building footprints, road centerlines and water
 * outlines as cheap line geometry, one Group per tile (tracked by the
 * floating origin, removed on drop). Phase 2 replaces this with real meshes.
 */
export function createDebugTiles(scene, origin) {
  const root = new THREE.Group();
  origin.track(root);
  scene.add(root);

  const tiles = new Map(); // key -> Group

  const matBuilding = new THREE.LineBasicMaterial({ color: 0x2a2f3a });
  const matWater = new THREE.LineBasicMaterial({ color: 0x2f6fb0 });
  const matRoadMajor = new THREE.LineBasicMaterial({ color: 0xe0a23a });
  const matRoadMinor = new THREE.LineBasicMaterial({ color: 0x9aa0aa });

  function ringSegments(rings, positions, y) {
    for (const ring of rings) {
      const n = ring.length / 2;
      if (n < 2) continue;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = origin.mercToWorld(ring[i * 2], ring[i * 2 + 1]);
        const b = origin.mercToWorld(ring[j * 2], ring[j * 2 + 1]);
        positions.push(a.x, y, a.z, b.x, y, b.z);
      }
    }
  }

  function lineSegments(pts, positions, y) {
    const n = pts.length / 2;
    for (let i = 0; i < n - 1; i++) {
      const a = origin.mercToWorld(pts[i * 2], pts[i * 2 + 1]);
      const b = origin.mercToWorld(pts[(i + 1) * 2], pts[(i + 1) * 2 + 1]);
      positions.push(a.x, y, a.z, b.x, y, b.z);
    }
  }

  function makeLines(positions, material) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.LineSegments(geo, material);
  }

  const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary']);

  function addTile(msg) {
    const key = `${msg.z}/${msg.x}/${msg.y}`;
    if (tiles.has(key)) return;
    const group = new THREE.Group();

    const bld = [];
    for (const b of msg.buildings || []) ringSegments(b.rings, bld, 0);
    if (bld.length) group.add(makeLines(bld, matBuilding));

    const wat = [];
    for (const w of msg.water || []) ringSegments(w.rings, wat, 0.1);
    if (wat.length) group.add(makeLines(wat, matWater));

    const major = [];
    const minor = [];
    for (const r of msg.roads || []) lineSegments(r.pts, MAJOR.has(r.klass) ? major : minor, 0.2);
    if (major.length) group.add(makeLines(major, matRoadMajor));
    if (minor.length) group.add(makeLines(minor, matRoadMinor));

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
