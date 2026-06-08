import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Pedestrians — pooled, capped, instanced low-poly figures that wander the
 * sidewalks (road edges) near the player and despawn beyond a radius. One draw
 * call; a small vertical bob fakes a walk cycle. Cheap inhabitants, nothing
 * city-wide.
 */
const MAX = 60;
const SPAWN_MAX = 130, DESPAWN = 170;
const SHIRTS = [0xd64545, 0x2f6fb0, 0x3c9a5f, 0xe0a83b, 0xece9e2, 0x394048, 0x9b59b6, 0xc0392b];

function makePersonGeo() {
  const body = new THREE.BoxGeometry(0.5, 1.1, 0.32).toNonIndexed(); body.translate(0, 0.85, 0);
  paint(body, 1, 1, 1);
  const head = new THREE.BoxGeometry(0.34, 0.34, 0.34).toNonIndexed(); head.translate(0, 1.6, 0);
  paint(head, 0.86, 0.7, 0.6);
  return mergeGeometries([body, head], false);
}
function paint(geo, r, g, b) {
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
}

export function createPedestrians(scene, cityTiles) {
  const geo = makePersonGeo();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const inst = new THREE.InstancedMesh(geo, mat, MAX);
  inst.frustumCulled = false;
  inst.count = MAX;
  scene.add(inst);

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const peds = [];
  for (let i = 0; i < MAX; i++) peds.push({ active: false });
  let rng = 9871;
  const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };

  function spawn(p, fx, fz) {
    // Pick a road near the player and drop the ped on its sidewalk.
    const tiles = cityTiles.roadTiles();
    if (!tiles.length) { p.active = false; return; }
    const rec = tiles[(rand() * tiles.length) | 0];
    const g = rec.road; if (!g || !g.meta.length) { p.active = false; return; }
    const r = g.meta[(rand() * g.meta.length) | 0];
    const seg = r.start + ((rand() * (r.count - 1)) | 0);
    const gx = rec.group.position.x, gz = rec.group.position.z;
    const ax = gx + g.pts[seg * 2], az = gz + g.pts[seg * 2 + 1];
    const bx = gx + g.pts[(seg + 1) * 2], bz = gz + g.pts[(seg + 1) * 2 + 1];
    let dx = bx - ax, dz = bz - az; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const side = rand() < 0.5 ? 1 : -1;
    const off = r.w / 2 + 1.6;
    const tt = rand();
    p.x = ax + (bx - ax) * tt - dz * side * off;
    p.z = az + (bz - az) * tt + dx * side * off;
    if (Math.hypot(p.x - fx, p.z - fz) > SPAWN_MAX) { p.active = false; return; }
    p.heading = Math.atan2(dx, dz) + (rand() < 0.5 ? 0 : Math.PI);
    p.speed = 1.1 + rand() * 0.8;
    p.turn = 0; p.phase = rand() * 6.28;
    p.colorIdx = (rand() * SHIRTS.length) | 0;
    p.active = true;
  }

  function update(dt, fx, fz) {
    for (let k = 0; k < MAX; k++) {
      const p = peds[k];
      if (!p.active) {
        if ((k + (rng & 7)) % 5 === 0) spawn(p, fx, fz);
      } else {
        // gentle wander
        if ((p.turn -= dt) <= 0) { p.heading += (rand() - 0.5) * 0.8; p.turn = 1 + rand() * 2; }
        p.x += Math.sin(p.heading) * p.speed * dt;
        p.z += Math.cos(p.heading) * p.speed * dt;
        p.phase += dt * p.speed * 3;
        const dx = p.x - fx, dz = p.z - fz;
        if (dx * dx + dz * dz > DESPAWN * DESPAWN) p.active = false;
      }
      if (p.active) {
        const bob = Math.abs(Math.sin(p.phase)) * 0.12;
        dummy.position.set(p.x, bob, p.z);
        dummy.rotation.set(0, p.heading, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        inst.setMatrixAt(k, dummy.matrix);
        inst.setColorAt(k, tint.set(SHIRTS[p.colorIdx]));
      } else {
        dummy.position.set(0, -9999, 0); dummy.updateMatrix();
        inst.setMatrixAt(k, dummy.matrix);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }

  function onRebase(dx, dz) {
    for (const p of peds) { if (p.active) { p.x += dx; p.z += dz; } }
  }

  return { update, onRebase };
}
