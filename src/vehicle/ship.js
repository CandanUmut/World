import * as THREE from 'three';

/**
 * Arcade boat — heavy, momentum-y, wide turns, and a gentle bob/rock so it
 * reads as floating. Same velocity-vector model as the car but low grip and a
 * slow helm. Best on the rivers and harbor, though it'll roam anywhere at water
 * level; building footprints still stop it. (Not water-clamped — a later refinement.)
 */
const ENGINE = 7, DRAG = 0.4, MAX_SPEED = 16, MAX_REVERSE = 5;
const TURN = 0.7, GRIP = 1.1, RADIUS = 4.5;
const BASE_Y = 0.3;

export function createShip() {
  const group = new THREE.Group();
  const pos = group.position;
  const vel = new THREE.Vector3();
  let heading = Math.PI, speed = 0, t = 0;
  const hit = { hit: false, dx: 0, dz: 0, nx: 0, nz: 0 };

  const hullMat = new THREE.MeshStandardMaterial({ color: 0xb6452f, roughness: 0.6, metalness: 0.1 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xe6ddc8, roughness: 0.8 });
  const cabMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.5 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 9), hullMat); hull.position.y = 0.7; group.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3, 4), hullMat);
  bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(0, 0.7, 5.4); bow.scale.set(1, 1, 0.5); group.add(bow);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 8.6), deckMat); deck.position.y = 1.45; group.add(deck);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 3), cabMat); cab.position.set(0, 2.3, -1.2); group.add(cab);

  function update(dt, input, collision) {
    const d = (c) => input.down(c);
    const throttle = d('KeyW') || d('ArrowUp');
    const braking = d('KeyS') || d('ArrowDown');
    const steer = ((d('KeyA') || d('ArrowLeft')) ? 1 : 0) - ((d('KeyD') || d('ArrowRight')) ? 1 : 0);

    const fx = Math.sin(heading), fz = Math.cos(heading);
    const rx = Math.cos(heading), rz = -Math.sin(heading);
    let vF = vel.x * fx + vel.z * fz;
    let vR = vel.x * rx + vel.z * rz;

    if (throttle) vF += ENGINE * dt;
    if (braking) vF -= (vF > 0 ? ENGINE : ENGINE * 0.7) * dt;
    vF -= vF * DRAG * dt;
    vF = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, vF));

    heading += steer * TURN * Math.min(1, Math.abs(vF) / 4) * Math.sign(vF || 1) * dt;
    vR *= Math.exp(-GRIP * dt);

    vel.set(fx * vF + rx * vR, 0, fz * vF + rz * vR);
    pos.x += vel.x * dt; pos.z += vel.z * dt;

    if (collision) {
      collision.resolve(pos.x, pos.z, RADIUS, hit);
      if (hit.hit) {
        pos.x += hit.dx; pos.z += hit.dz;
        const into = vel.x * hit.nx + vel.z * hit.nz;
        if (into < 0) { vel.x -= hit.nx * into; vel.z -= hit.nz * into; }
        vel.multiplyScalar(0.7);
      }
    }

    t += dt;
    speed = Math.hypot(vel.x, vel.z);
    pos.y = BASE_Y + Math.sin(t * 1.2) * 0.18;
    group.rotation.set(Math.sin(t * 1.0) * 0.025, heading, Math.sin(t * 0.8) * 0.04, 'YXZ');
    return { collided: hit.hit };
  }

  function setPose(x, z, h = Math.PI) {
    pos.set(x, BASE_Y, z); vel.set(0, 0, 0); heading = h; speed = 0;
    group.rotation.set(0, heading, 0, 'YXZ');
  }

  return {
    group, update, setPose,
    get position() { return pos; },
    get heading() { return heading; },
    get speed() { return speed; },
    get speedKmh() { return speed * 3.6; },
    get forwardSpeed() { return vel.x * Math.sin(heading) + vel.z * Math.cos(heading); },
    forward(out) { return out.set(Math.sin(heading), 0, Math.cos(heading)); },
  };
}
