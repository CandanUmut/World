import * as THREE from 'three';

/**
 * Placeholder ground for Phase 0 — a large stylized plane with a subtle grid
 * so motion is readable. Replaced by land-use ground meshes in Phase 2.
 */
export function createGroundGrid() {
  const group = new THREE.Group();

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(8000, 8000),
    new THREE.MeshStandardMaterial({ color: 0x6f8a5a, roughness: 1, metalness: 0 }),
  );
  plane.rotation.x = -Math.PI / 2;
  group.add(plane);

  const grid = new THREE.GridHelper(8000, 160, 0x3a4a30, 0x55694a);
  grid.position.y = 0.05;
  group.add(grid);

  // A few reference cubes so depth + parallax read while flying.
  const cubeGeo = new THREE.BoxGeometry(20, 60, 20);
  const cubeMat = new THREE.MeshStandardMaterial({ color: 0xb98b5e, roughness: 0.9 });
  for (let i = 0; i < 24; i++) {
    const c = new THREE.Mesh(cubeGeo, cubeMat);
    const a = (i / 24) * Math.PI * 2;
    const r = 300 + (i % 5) * 120;
    c.position.set(Math.cos(a) * r, 30, Math.sin(a) * r);
    c.scale.y = 0.5 + (i % 7) * 0.4;
    c.position.y = 30 * c.scale.y;
    group.add(c);
  }

  return group;
}
