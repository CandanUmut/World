import * as THREE from 'three';

/**
 * Arcade car — Midtown-Madness feel, not a sim.
 *
 * Physics is a velocity-vector model: forward thrust + a separate lateral
 * (sideways) velocity that grip bleeds off each frame. Low grip = long slides;
 * the handbrake drops grip to near zero for deliberate drifts. Steering can't
 * pivot a parked car and eases off at top speed so the car stays planted.
 *
 * The car GROUP's position IS the physics position (shared Vector3), so a
 * floating-origin rebase that shifts the group also shifts the car for free.
 * The only real light in the scene is the sun; head/tail lights are emissive
 * quads (they'll bloom once Phase 5 adds the post pass).
 */

const BODY_COLORS = [0xd64545, 0x2f6fb0, 0xe0a83b, 0x3c9a5f, 0xece9e2, 0x444a52, 0x8e44ad];

// Tuning (meters, seconds).
const ENGINE = 15;        // forward accel
const REVERSE = 9;
const BRAKE = 28;
const DRAG = 0.55;        // linear air/rolling drag (per second)
const ROLL = 3.2;         // constant rolling resistance (m/s^2)
const MAX_SPEED = 46;     // ~165 km/h
const MAX_REVERSE = 12;
const MAX_STEER = 2.5;    // rad/s at full effect
const GRIP = 6.0;         // lateral velocity decay rate
const GRIP_DRIFT = 1.3;   // handbrake grip (slide)
const RADIUS = 2.2;       // collision circle

export function createCar(seed = 1) {
  const group = new THREE.Group();
  const pos = group.position;            // physics position == group position
  const vel = new THREE.Vector3();
  let heading = Math.PI;                 // face north (-Z) at spawn
  let speed = 0;
  let wheelSpin = 0;
  const hit = { hit: false, dx: 0, dz: 0, nx: 0, nz: 0 };

  // --- mesh ---------------------------------------------------------------
  const bodyColor = BODY_COLORS[seed % BODY_COLORS.length];
  const paint = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.45, metalness: 0.25 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x222a33, roughness: 0.25, metalness: 0.6 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x161718, roughness: 0.9 });
  const head = new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0xfff0c8, emissiveIntensity: 1.4 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x4a0d0d, emissive: 0xff2222, emissiveIntensity: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 4.3), paint);
  body.position.y = 0.75;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.75, 2.1), glass);
  cabin.position.set(0, 1.45, -0.15);
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.35, 12);
  wheelGeo.rotateZ(Math.PI / 2); // axle along X
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, tyre);
    w.position.set(wx, 0.46, wz);
    group.add(w);
    wheels.push(w);
  }

  const lampGeo = new THREE.BoxGeometry(0.42, 0.28, 0.1);
  for (const lx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(lampGeo, head); h.position.set(lx, 0.75, 2.18); group.add(h);
    const t = new THREE.Mesh(lampGeo, tail); t.position.set(lx, 0.78, -2.18); group.add(t);
  }

  // --- physics ------------------------------------------------------------
  function update(dt, input, collision) {
    const d = (c) => input.down(c);
    const throttle = d('KeyW') || d('ArrowUp');
    const braking = d('KeyS') || d('ArrowDown');
    const steer = ((d('KeyA') || d('ArrowLeft')) ? 1 : 0) - ((d('KeyD') || d('ArrowRight')) ? 1 : 0);
    const handbrake = d('Space');

    const fx = Math.sin(heading), fz = Math.cos(heading);   // forward
    const rx = Math.cos(heading), rz = -Math.sin(heading);  // right

    let vF = vel.x * fx + vel.z * fz; // forward (signed)
    let vR = vel.x * rx + vel.z * rz; // lateral

    if (throttle) vF += ENGINE * dt;
    if (braking) vF -= (vF > 0.4 ? BRAKE : REVERSE) * dt;

    vF -= vF * DRAG * dt;
    if (vF > ROLL * dt) vF -= ROLL * dt;
    else if (vF < -ROLL * dt) vF += ROLL * dt;
    else if (!throttle && !braking) vF = 0;
    vF = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, vF));

    // Steering: no pivot when parked, eases off near top speed.
    const sp = Math.abs(vF);
    const engage = Math.min(sp / 6, 1);
    const tighten = 1 - 0.45 * Math.min(sp / MAX_SPEED, 1);
    heading += steer * MAX_STEER * engage * tighten * Math.sign(vF || 1) * dt;

    // Lateral grip / drift.
    vR *= Math.exp(-(handbrake ? GRIP_DRIFT : GRIP) * dt);
    if (handbrake) vF -= vF * 0.5 * dt;

    vel.set(fx * vF + rx * vR, 0, fz * vF + rz * vR);
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;

    if (collision) {
      collision.resolve(pos.x, pos.z, RADIUS, hit);
      if (hit.hit) {
        pos.x += hit.dx; pos.z += hit.dz;
        const into = vel.x * hit.nx + vel.z * hit.nz;
        if (into < 0) { vel.x -= hit.nx * into; vel.z -= hit.nz * into; }
        vel.multiplyScalar(0.82); // scrub on impact
      }
    }

    group.rotation.y = heading;
    speed = Math.hypot(vel.x, vel.z);

    // Visuals: spin wheels, brighten brake/reverse lights.
    wheelSpin += (vF / 0.46) * dt;
    for (const w of wheels) w.rotation.x = wheelSpin;
    tail.emissiveIntensity = braking ? 2.6 : 0.9;
    head.emissiveIntensity = 1.4;

    return { collided: hit.hit };
  }

  function setPose(x, z, h = Math.PI) {
    pos.set(x, 0, z); vel.set(0, 0, 0); heading = h; speed = 0;
    group.rotation.y = heading;
  }

  return {
    group,
    update,
    setPose,
    get position() { return pos; },
    get heading() { return heading; },
    get speed() { return speed; },               // m/s (magnitude)
    get speedKmh() { return speed * 3.6; },
    get forwardSpeed() { return vel.x * Math.sin(heading) + vel.z * Math.cos(heading); },
    forward(out) { return out.set(Math.sin(heading), 0, Math.cos(heading)); },
  };
}
