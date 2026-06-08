import * as THREE from 'three';

/**
 * Arcade plane — switch to it and you're launched into a cruise so there's no
 * fussy takeoff. W/S throttle, ↑/↓ (or I/K) pitch, A/D (or ←/→) bank-turn. It
 * flies on a simple direction-times-airspeed model, banks into turns, auto-levels
 * when you let go, and only checks building collision when it's down low.
 */
const ACC = 26, DRAG = 0.25, MAX_SPEED = 130, MIN_SPEED = 0;
const PITCH_RATE = 0.9, YAW_RATE = 0.7, PITCH_MAX = 0.6;
const RADIUS = 6;

export function createPlane() {
  const group = new THREE.Group();
  const pos = group.position;
  let heading = Math.PI, pitch = 0, roll = 0, speed = 0;
  const hit = { hit: false, dx: 0, dz: 0, nx: 0, nz: 0 };

  const paint = new THREE.MeshStandardMaterial({ color: 0xe8eef3, roughness: 0.4, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x33404d, roughness: 0.6 });
  const navR = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2222, emissiveIntensity: 2 });
  const navG = new THREE.MeshStandardMaterial({ color: 0x005500, emissive: 0x22ff44, emissiveIntensity: 2 });

  const fuse = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 8), paint); fuse.position.y = 2; group.add(fuse);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 8), paint);
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 2, 4.6); group.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(13, 0.25, 1.9), paint); wing.position.set(0, 2, 0.3); group.add(wing);
  const tailW = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.2, 1.1), paint); tailW.position.set(0, 2.2, -3.6); group.add(tailW);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 1.3), dark); fin.position.set(0, 3, -3.6); group.add(fin);
  const lR = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), navR); lR.position.set(-6.4, 2, 0.3); group.add(lR);
  const lG = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), navG); lG.position.set(6.4, 2, 0.3); group.add(lG);

  function update(dt, input, collision) {
    const d = (c) => input.down(c);
    if (d('KeyW')) speed += ACC * dt;
    if (d('KeyS')) speed -= ACC * dt;
    speed -= speed * DRAG * dt;
    speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed));

    const pitchIn = (d('ArrowUp') || d('KeyI') ? 1 : 0) - (d('ArrowDown') || d('KeyK') ? 1 : 0);
    const yawIn = (d('ArrowLeft') || d('KeyA') ? 1 : 0) - (d('ArrowRight') || d('KeyD') ? 1 : 0);
    pitch += pitchIn * PITCH_RATE * dt;
    if (!pitchIn) pitch *= Math.exp(-1.5 * dt); // auto-level
    pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch));
    heading += yawIn * YAW_RATE * dt * Math.min(1, speed / 30);
    roll = roll * Math.exp(-4 * dt) + yawIn * 0.5 * (1 - Math.exp(-4 * dt));

    const cp = Math.cos(pitch);
    const dx = Math.sin(heading) * cp, dy = Math.sin(pitch), dz = Math.cos(heading) * cp;
    pos.x += dx * speed * dt;
    pos.y += dy * speed * dt;
    pos.z += dz * speed * dt;

    if (pos.y < 1.2) { pos.y = 1.2; if (pitch < 0) pitch = 0; speed *= Math.exp(-1.2 * dt); }

    if (collision && pos.y < 30) {
      collision.resolve(pos.x, pos.z, RADIUS, hit);
      if (hit.hit) { pos.x += hit.dx; pos.z += hit.dz; speed *= 0.7; }
    }

    group.rotation.set(-pitch, heading, -roll, 'YXZ');
    return { collided: hit.hit };
  }

  function setPose(x, z, h = Math.PI) {
    pos.set(x, 130, z); heading = h; pitch = 0; roll = 0; speed = 60;
    group.rotation.set(0, heading, 0, 'YXZ');
  }

  return {
    group, update, setPose,
    get position() { return pos; },
    get heading() { return heading; },
    get speed() { return speed; },
    get speedKmh() { return speed * 3.6; },
    get forwardSpeed() { return speed; },
    get altitude() { return pos.y; },
    forward(out) { return out.set(Math.sin(heading), 0, Math.cos(heading)); },
  };
}
