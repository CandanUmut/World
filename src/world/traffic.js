import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Ambient traffic — instanced cars that path-follow the streamed road graph,
 * spawned in a ring around the player and despawned beyond it (pooled, capped,
 * one draw call). Each car copies its road polyline into world space at spawn,
 * so it keeps driving even after its source tile unloads, and shifts cleanly on
 * rebase. Cars stop when a red light is just ahead.
 */
const MAX = 44;
const SPAWN_MIN = 40, SPAWN_MAX = 240, DESPAWN = 300;
const PALETTE = [0xd64545, 0x2f6fb0, 0xe0a83b, 0x3c9a5f, 0xe9e6df, 0x394048, 0x9b59b6, 0x16a085];

function makeCarGeo() {
  const body = new THREE.BoxGeometry(1.8, 0.8, 4.0).toNonIndexed(); body.translate(0, 0.7, 0);
  paint(body, 1, 1, 1);
  const cab = new THREE.BoxGeometry(1.6, 0.6, 2.0).toNonIndexed(); cab.translate(0, 1.35, -0.1);
  paint(cab, 0.15, 0.17, 0.2);
  return mergeGeometries([body, cab], false);
}
function paint(geo, r, g, b) {
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
}

export function createTraffic(scene, cityTiles, signals) {
  const geo = makeCarGeo();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
  const inst = new THREE.InstancedMesh(geo, mat, MAX);
  inst.frustumCulled = false;
  inst.count = MAX;
  scene.add(inst);

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const cars = [];
  for (let i = 0; i < MAX; i++) cars.push({ active: false });
  let rng = 12345;
  const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };

  // Gather drivable polylines (world space) near the player.
  function candidates(fx, fz) {
    const out = [];
    for (const rec of cityTiles.roadTiles()) {
      const g = rec.road; if (!g) continue;
      const gx = rec.group.position.x, gz = rec.group.position.z;
      for (const r of g.meta) {
        // distance check on the first vertex
        const sx = gx + g.pts[r.start * 2], sz = gz + g.pts[r.start * 2 + 1];
        const dx = sx - fx, dz = sz - fz;
        const d = Math.hypot(dx, dz);
        if (d < SPAWN_MIN || d > SPAWN_MAX) continue;
        out.push({ g, gx, gz, r });
      }
    }
    return out;
  }

  function spawn(car, fx, fz) {
    const cands = candidates(fx, fz);
    if (!cands.length) { car.active = false; return; }
    const pick = cands[(rand() * cands.length) | 0];
    const { g, gx, gz, r } = pick;
    const poly = new Float32Array(r.count * 2);
    for (let i = 0; i < r.count; i++) {
      poly[i * 2] = gx + g.pts[(r.start + i) * 2];
      poly[i * 2 + 1] = gz + g.pts[(r.start + i) * 2 + 1];
    }
    car.poly = poly;
    car.dir = r.oneway ? 1 : (rand() < 0.5 ? 1 : -1);
    car.i = car.dir > 0 ? 0 : r.count - 1;       // current vertex
    car.t = 0;
    car.speed = (r.w >= 9 ? 16 : r.w >= 6 ? 11 : 7) * (0.8 + rand() * 0.4);
    car.colorIdx = (rand() * PALETTE.length) | 0;
    car.active = true;
    car.x = poly[car.i * 2]; car.z = poly[car.i * 2 + 1]; car.heading = 0;
  }

  function step(car, dt) {
    const n = car.poly.length / 2;
    const a = car.i, b = car.i + car.dir;
    if (b < 0 || b >= n) { car.active = false; return; }
    const ax = car.poly[a * 2], az = car.poly[a * 2 + 1];
    const bx = car.poly[b * 2], bz = car.poly[b * 2 + 1];
    const segLen = Math.hypot(bx - ax, bz - az) || 1;
    car.heading = Math.atan2(bx - ax, bz - az);

    // Stop if a red light is just ahead of the nose.
    const noseX = car.x + Math.sin(car.heading) * 6;
    const noseZ = car.z + Math.cos(car.heading) * 6;
    if (!signals.redAhead(noseX, noseZ)) {
      car.t += (car.speed * dt) / segLen;
      while (car.t >= 1) {
        car.t -= 1; car.i = b;
        if (car.i + car.dir < 0 || car.i + car.dir >= n) { car.active = false; return; }
        return; // recompute next frame
      }
    }
    car.x = ax + (bx - ax) * car.t;
    car.z = az + (bz - az) * car.t;
  }

  function update(dt, fx, fz) {
    for (let k = 0; k < MAX; k++) {
      const car = cars[k];
      if (car.active) {
        step(car, dt);
        if (car.active) {
          const dx = car.x - fx, dz = car.z - fz;
          if (dx * dx + dz * dz > DESPAWN * DESPAWN) car.active = false;
        }
      } else if ((k + (rng & 3)) % 3 === 0) {
        spawn(car, fx, fz); // amortize spawns across frames
      }
      if (car.active) {
        dummy.position.set(car.x, 0.05, car.z);
        dummy.rotation.set(0, car.heading, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        inst.setMatrixAt(k, dummy.matrix);
        inst.setColorAt(k, tint.set(PALETTE[car.colorIdx]));
      } else {
        dummy.position.set(0, -9999, 0); dummy.updateMatrix();
        inst.setMatrixAt(k, dummy.matrix);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }

  function onRebase(dx, dz) {
    for (const car of cars) {
      if (!car.active) continue;
      car.x += dx; car.z += dz;
      const p = car.poly;
      for (let i = 0; i < p.length; i += 2) { p[i] += dx; p[i + 1] += dz; }
    }
  }

  return { update, onRebase };
}
