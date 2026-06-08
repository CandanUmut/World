import * as THREE from 'three';

/**
 * Traffic lights — visual-first. Intersection nodes are detected in the worker
 * (road vertices shared by 3+ roads) and gathered here each frame from the
 * streamed tiles (rebase-safe via tile group positions). Lights cycle on a
 * global clock split by a stable spatial parity so crossing streets alternate;
 * ambient cars query redAhead() and stop. One unlit InstancedMesh of bulbs +
 * one of posts — two draw calls for the whole city.
 */
const MAX = 256;
const CYCLE = 9;          // seconds per full red+green
const GATHER_R = 600;     // only nodes within this of the player
const STOP_R = 13;        // a car this close to a red bulb stops

const GREEN = new THREE.Color(0.15, 1.0, 0.25);
const RED = new THREE.Color(1.0, 0.12, 0.08);

export function createSignals(scene, cityTiles) {
  const bulbGeo = new THREE.SphereGeometry(0.6, 6, 5);
  bulbGeo.translate(0, 3.2, 0);
  const bulbMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const postGeo = new THREE.CylinderGeometry(0.12, 0.14, 3.2, 5);
  postGeo.translate(0, 1.6, 0);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.8 });

  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, MAX);
  const posts = new THREE.InstancedMesh(postGeo, postMat, MAX);
  bulbs.frustumCulled = false; posts.frustumCulled = false;
  bulbs.count = 0; posts.count = 0;
  scene.add(posts, bulbs);

  const dummy = new THREE.Object3D();
  const nx = new Float32Array(MAX);
  const nz = new Float32Array(MAX);
  const red = new Uint8Array(MAX);
  let count = 0;
  let timer = 0;

  function update(dt, fx, fz) {
    timer += dt;
    const greenA = (timer % CYCLE) < CYCLE * 0.46; // phase A green first half
    const tiles = cityTiles.roadTiles();
    const r2 = GATHER_R * GATHER_R;
    count = 0;
    for (const rec of tiles) {
      const nodes = rec.road && rec.road.nodes;
      if (!nodes) continue;
      const gx = rec.group.position.x, gz = rec.group.position.z;
      for (let i = 0; i < nodes.length; i += 2) {
        const wx = gx + nodes[i], wz = gz + nodes[i + 1];
        const dx = wx - fx, dz = wz - fz;
        if (dx * dx + dz * dz > r2) continue;
        if (count >= MAX) break;
        const parity = (Math.round(wx / 18) + Math.round(wz / 18)) & 1;
        const isGreen = parity ? !greenA : greenA;
        nx[count] = wx; nz[count] = wz; red[count] = isGreen ? 0 : 1;
        dummy.position.set(wx, 0, wz);
        dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        posts.setMatrixAt(count, dummy.matrix);
        bulbs.setMatrixAt(count, dummy.matrix);
        bulbs.setColorAt(count, isGreen ? GREEN : RED);
        count++;
      }
      if (count >= MAX) break;
    }
    bulbs.count = count; posts.count = count;
    posts.instanceMatrix.needsUpdate = true;
    bulbs.instanceMatrix.needsUpdate = true;
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
  }

  /** True if a red light sits within STOP_R of (x,z). */
  function redAhead(x, z) {
    const r2 = STOP_R * STOP_R;
    for (let i = 0; i < count; i++) {
      if (!red[i]) continue;
      const dx = x - nx[i], dz = z - nz[i];
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  }

  function onRebase(dx, dz) {
    for (let i = 0; i < count; i++) { nx[i] += dx; nz[i] += dz; }
  }

  return { update, redAhead, onRebase };
}
